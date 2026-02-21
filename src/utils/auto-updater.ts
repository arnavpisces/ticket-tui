import { spawn } from 'child_process';
import { readFileSync } from 'fs';

interface PackageMetadata {
  name: string;
  version: string;
}

export interface AutoUpdateEvent {
  type:
    | 'check-started'
    | 'up-to-date'
    | 'update-available'
    | 'update-install-started'
    | 'update-install-failed'
    | 'check-failed'
    | 'disabled';
  packageName: string;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

type AutoUpdateListener = (event: AutoUpdateEvent) => void;

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

function readPackageMetadata(): PackageMetadata | null {
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

function shouldAutoUpdate(): boolean {
  return process.env.SUTRA_DISABLE_AUTO_UPDATE !== '1';
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

  const child = spawn(
    'npm',
    ['install', '-g', `${packageName}@${targetVersion}`, '--silent', '--no-fund', '--no-audit'],
    {
      stdio: 'ignore',
      detached: false,
    }
  );

  child.on('error', (error) => {
    emitAutoUpdateEvent({
      type: 'update-install-failed',
      packageName,
      currentVersion,
      latestVersion: targetVersion,
      error: error instanceof Error ? error.message : 'Unknown install error',
    });
  });

  child.on('close', (code) => {
    if (code !== 0) {
      emitAutoUpdateEvent({
        type: 'update-install-failed',
        packageName,
        currentVersion,
        latestVersion: targetVersion,
        error: `npm exited with code ${code ?? 'unknown'}`,
      });
    }
  });
}

async function checkAndUpdate(): Promise<void> {
  if (isChecking || !shouldAutoUpdate()) return;
  const metadata = readPackageMetadata();
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
  const metadata = readPackageMetadata();
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
