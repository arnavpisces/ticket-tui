import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export interface PackageMetadata {
  name: string;
  version: string;
}

export interface AutoUpdateEvent {
  type:
    | 'check-started'
    | 'up-to-date'
    | 'update-available'
    | 'update-install-started'
    | 'update-installed'
    | 'update-install-failed'
    | 'check-failed'
    | 'disabled';
  packageName: string;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

type AutoUpdateListener = (event: AutoUpdateEvent) => void;

export interface ManualUpdateResult {
  status: 'updated' | 'up-to-date' | 'failed';
  packageName?: string;
  currentVersion?: string;
  latestVersion?: string;
  message: string;
}

const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const CHECK_TIMEOUT_MS = 8000;
const INSTALL_COOLDOWN_MS = 10 * 60 * 1000;

let intervalHandle: NodeJS.Timeout | null = null;
let isChecking = false;
let installCooldownUntil = 0;
let lastAttemptedVersion: string | null = null;
let hasShownStartupStatus = false;
const listeners = new Set<AutoUpdateListener>();
const queuedEvents: AutoUpdateEvent[] = [];

function emitAutoUpdateEvent(event: AutoUpdateEvent): void {
  queuedEvents.push(event);
  if (queuedEvents.length > 20) {
    queuedEvents.shift();
  }

  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // no-op: listeners must not break updater flow
    }
  }
}

export function subscribeAutoUpdateEvents(listener: AutoUpdateListener): () => void {
  listeners.add(listener);
  if (queuedEvents.length > 0) {
    const replay = [...queuedEvents];
    queuedEvents.length = 0;
    for (const event of replay) {
      try {
        listener(event);
      } catch {
        // no-op
      }
    }
  }
  return () => listeners.delete(listener);
}

export function getRuntimePackageMetadata(): PackageMetadata | null {
  try {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PackageMetadata>;
    if (!parsed.name || !parsed.version) return null;
    return { name: parsed.name, version: parsed.version };
  } catch {
    return null;
  }
}

function parseVersion(version: string): { core: number[]; pre: string[] } | null {
  const normalized = version.trim().replace(/^v/i, '');
  const [corePart, prePart = ''] = normalized.split('-', 2);
  const core = corePart.split('.');
  if (core.length < 3) return null;
  const numbers = core.slice(0, 3).map((part) => Number.parseInt(part, 10));
  if (numbers.some((n) => Number.isNaN(n))) return null;
  const pre = prePart ? prePart.split('.') : [];
  return { core: numbers, pre };
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return a === b ? 0 : a > b ? 1 : -1;

  for (let i = 0; i < 3; i += 1) {
    if (pa.core[i] > pb.core[i]) return 1;
    if (pa.core[i] < pb.core[i]) return -1;
  }

  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;

  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i += 1) {
    const av = pa.pre[i];
    const bv = pb.pre[i];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    const ai = Number.parseInt(av, 10);
    const bi = Number.parseInt(bv, 10);
    const an = Number.isNaN(ai);
    const bn = Number.isNaN(bi);
    if (!an && !bn) {
      if (ai > bi) return 1;
      if (ai < bi) return -1;
      continue;
    }
    if (!an && bn) return -1;
    if (an && !bn) return 1;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
}

function getCheckIntervalMs(): number {
  const fromEnv = Number.parseInt(process.env.SUTRA_AUTO_UPDATE_INTERVAL_MS || '', 10);
  if (!Number.isNaN(fromEnv) && fromEnv >= 60_000) {
    return fromEnv;
  }
  return DEFAULT_CHECK_INTERVAL_MS;
}

function isLocalSourceCheckout(): boolean {
  try {
    return existsSync(new URL('../../.git', import.meta.url));
  } catch {
    return false;
  }
}

function shouldAutoUpdate(): boolean {
  if (process.env.SUTRA_FORCE_AUTO_UPDATE === '1') {
    return true;
  }
  if (process.env.SUTRA_DISABLE_AUTO_UPDATE === '1') {
    return false;
  }
  // Local source runs (for example `npm start`) should not self-update.
  if (isLocalSourceCheckout()) {
    return false;
  }
  return true;
}

async function fetchLatestVersion(packageName: string): Promise<string | null> {
  const encodedName = encodeURIComponent(packageName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(`https://registry.npmjs.org/${encodedName}/latest`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { version?: string };
    return typeof payload.version === 'string' ? payload.version.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function installVersion(
  packageName: string,
  targetVersion: string,
  options: { silent: boolean; stdio: 'ignore' | 'inherit' }
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = [
      'install',
      '-g',
      `${packageName}@${targetVersion}`,
      ...(options.silent ? ['--silent'] : []),
      '--no-fund',
      '--no-audit',
    ];

    const child = spawn('npm', args, {
      stdio: options.stdio,
      detached: false,
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown install error',
      });
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
        return;
      }

      resolve({
        success: false,
        error: `npm exited with code ${code ?? 'unknown'}`,
      });
    });
  });
}

function installLatest(
  packageName: string,
  currentVersion: string,
  targetVersion: string
): void {
  if (lastAttemptedVersion === targetVersion) return;
  if (Date.now() < installCooldownUntil) return;
  lastAttemptedVersion = targetVersion;
  installCooldownUntil = Date.now() + INSTALL_COOLDOWN_MS;

  emitAutoUpdateEvent({
    type: 'update-install-started',
    packageName,
    currentVersion,
    latestVersion: targetVersion,
  });

  void installVersion(packageName, targetVersion, { silent: true, stdio: 'ignore' }).then((result) => {
    if (result.success) {
      emitAutoUpdateEvent({
        type: 'update-installed',
        packageName,
        currentVersion,
        latestVersion: targetVersion,
      });
      return;
    }
    emitAutoUpdateEvent({
      type: 'update-install-failed',
      packageName,
      currentVersion,
      latestVersion: targetVersion,
      error: result.error,
    });
  });
}

async function checkAndUpdate(): Promise<void> {
  if (isChecking || !shouldAutoUpdate()) return;
  const metadata = getRuntimePackageMetadata();
  if (!metadata) return;

  isChecking = true;
  try {
    if (!hasShownStartupStatus) {
      emitAutoUpdateEvent({
        type: 'check-started',
        packageName: metadata.name,
        currentVersion: metadata.version,
      });
    }

    const latest = await fetchLatestVersion(metadata.name);
    if (!latest) {
      if (!hasShownStartupStatus) {
        emitAutoUpdateEvent({
          type: 'check-failed',
          packageName: metadata.name,
          currentVersion: metadata.version,
          error: 'Unable to reach npm registry',
        });
      }
      hasShownStartupStatus = true;
      return;
    }

    if (compareVersions(latest, metadata.version) <= 0) {
      if (!hasShownStartupStatus) {
        emitAutoUpdateEvent({
          type: 'up-to-date',
          packageName: metadata.name,
          currentVersion: metadata.version,
          latestVersion: latest,
        });
      }
      hasShownStartupStatus = true;
      return;
    }

    emitAutoUpdateEvent({
      type: 'update-available',
      packageName: metadata.name,
      currentVersion: metadata.version,
      latestVersion: latest,
    });
    installLatest(metadata.name, metadata.version, latest);
    hasShownStartupStatus = true;
  } finally {
    isChecking = false;
  }
}

export function startAutoUpdater(): () => void {
  const metadata = getRuntimePackageMetadata();
  if (!shouldAutoUpdate()) {
    if (metadata) {
      emitAutoUpdateEvent({
        type: 'disabled',
        packageName: metadata.name,
        currentVersion: metadata.version,
      });
    }
    return () => {};
  }
  if (intervalHandle) return () => {};

  void checkAndUpdate();
  intervalHandle = setInterval(() => {
    void checkAndUpdate();
  }, getCheckIntervalMs());

  return () => {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };
}

export async function updateCliFromNpm(): Promise<ManualUpdateResult> {
  const metadata = getRuntimePackageMetadata();
  if (!metadata) {
    return {
      status: 'failed',
      message: 'Unable to read package metadata for update check.',
    };
  }

  const latest = await fetchLatestVersion(metadata.name);
  if (!latest) {
    return {
      status: 'failed',
      packageName: metadata.name,
      currentVersion: metadata.version,
      message: 'Unable to reach npm registry to check for updates.',
    };
  }

  if (compareVersions(latest, metadata.version) <= 0) {
    return {
      status: 'up-to-date',
      packageName: metadata.name,
      currentVersion: metadata.version,
      latestVersion: latest,
      message: `Already on the latest version (${metadata.version}).`,
    };
  }

  const installResult = await installVersion(metadata.name, latest, {
    silent: false,
    stdio: 'inherit',
  });

  if (!installResult.success) {
    return {
      status: 'failed',
      packageName: metadata.name,
      currentVersion: metadata.version,
      latestVersion: latest,
      message: installResult.error || 'Failed to install latest version.',
    };
  }

  return {
    status: 'updated',
    packageName: metadata.name,
    currentVersion: metadata.version,
    latestVersion: latest,
    message: `Updated ${metadata.name} from ${metadata.version} to ${latest}.`,
  };
}
