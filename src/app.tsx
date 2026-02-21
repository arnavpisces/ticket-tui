import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { ConfigManager } from './config/config-manager.js';
import { JiraClient } from './api/jira-client.js';
import { ConfluenceClient } from './api/confluence-client.js';
import { Header } from './components/common/Header.js';
import { TabBar } from './components/common/TabBar.js';
import { Footer } from './components/common/Footer.js';
import { Spinner } from './components/common/Spinner.js';
import { HelpModal } from './components/common/HelpModal.js';
import { Toast } from './components/common/Toast.js';
import { JiraView } from './components/jira/JiraView.js';
import { ConfluenceView } from './components/confluence/ConfluenceView.js';
import { subscribeAutoUpdateEvents } from './utils/auto-updater.js';
import { te } from './theme/te.js';

type ConnectionStatus = 'connected' | 'disconnected' | 'loading';
type ToastPayload = {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
};

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [activeTab, setActiveTab] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [jiraClient, setJiraClient] = useState<JiraClient | null>(null);
  const [confluenceClient, setConfluenceClient] = useState<ConfluenceClient | null>(
    null
  );
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('loading');
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [toastQueue, setToastQueue] = useState<ToastPayload[]>([]);
  const [jiraOpenCount, setJiraOpenCount] = useState<number | null>(null);
  const [jiraTotalCount, setJiraTotalCount] = useState<number | null>(null);
  const [myConfluenceDocs, setMyConfluenceDocs] = useState<number | null>(null);
  const [metricsRefreshNonce, setMetricsRefreshNonce] = useState(0);
  const lastMetricAdjustRef = useRef(0);

  // Get terminal dimensions for fixed-height rendering
  // Subtract 1 to ensure content doesn't push header off-screen
  const terminalHeight = (stdout?.rows || 24) - 1;
  const enqueueToast = useCallback((next: ToastPayload) => {
    setToastQueue((prev) => [...prev, next]);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        const config = ConfigManager.getConfig();

        if (!config.jira || !config.confluence) {
          setError('Configuration incomplete. Run setup: sutra setup');
          setConnectionStatus('disconnected');
          return;
        }

        const jira = new JiraClient(config.jira);
        const confluence = new ConfluenceClient(config.confluence);
        const validationErrors: string[] = [];

        try {
          await jira.getMyself();
        } catch (err) {
          validationErrors.push(
            `Jira validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }

        try {
          await confluence.getSpaces(1);
        } catch (err) {
          validationErrors.push(
            `Confluence validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }

        if (validationErrors.length > 0) {
          setError(
            `Configuration validation failed.\n${validationErrors.join('\n')}\nRun: sutra setup --force`
          );
          setConnectionStatus('disconnected');
          return;
        }

        setJiraClient(jira);
        setJiraBaseUrl(config.jira.baseUrl);
        setConfluenceClient(confluence);
        setConnectionStatus('connected');
        enqueueToast({
          type: 'success',
          message: 'Successful setup: Jira and Confluence credentials verified.',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize clients');
        setConnectionStatus('disconnected');
      }
    };

    initialize();
  }, [enqueueToast]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAutoUpdateEvents((event) => {
      if (event.type === 'disabled') return;

      if (event.type === 'check-started') {
        enqueueToast({
          type: 'info',
          message: `Auto-update: checking npm for newer versions (current v${event.currentVersion})...`,
          duration: 3000,
        });
        return;
      }

      if (event.type === 'up-to-date') {
        enqueueToast({
          type: 'success',
          message: `Auto-update: you're on the latest version (v${event.currentVersion}).`,
          duration: 3000,
        });
        return;
      }

      if (event.type === 'update-available') {
        enqueueToast({
          type: 'warning',
          message: `Update available: v${event.latestVersion} (current v${event.currentVersion}). Downloading now...`,
          duration: 5000,
        });
        return;
      }

      if (event.type === 'update-install-started') {
        enqueueToast({
          type: 'info',
          message: `Auto-update: installing v${event.latestVersion} in background.`,
          duration: 4000,
        });
        return;
      }

      if (event.type === 'update-install-failed') {
        enqueueToast({
          type: 'error',
          message: `Auto-update failed for v${event.latestVersion}: ${event.error || 'install error'}`,
          duration: 6000,
        });
        return;
      }

      if (event.type === 'check-failed') {
        enqueueToast({
          type: 'warning',
          message: `Auto-update check failed: ${event.error || 'could not reach npm registry'}`,
          duration: 5000,
        });
      }
    });
    return () => unsubscribe();
  }, [enqueueToast]);

  useEffect(() => {
    if (toast || toastQueue.length === 0) return;
    const [next, ...rest] = toastQueue;
    setToast(next);
    setToastQueue(rest);
  }, [toast, toastQueue]);

  useEffect(() => {
    if (!jiraClient || !confluenceClient || connectionStatus !== 'connected') return;
    let cancelled = false;

    const fetchJiraMetric = async () => {
      try {
        const [openCount, totalCount] = await Promise.all([
          jiraClient.getIssueCount('assignee = currentUser() AND statusCategory = Done'),
          jiraClient.getIssueCount('assignee = currentUser()'),
        ]);

        if (cancelled) return;
        // Don't overwrite locally-adjusted counts until the Jira search index catches up
        if (Date.now() - lastMetricAdjustRef.current < 8_000) return;
        setJiraOpenCount(openCount);
        setJiraTotalCount(totalCount);
      } catch {
        // Keep last known values on error (don't null out)
      }
    };

    const fetchConfluenceMetric = async () => {
      try {
        const cql = 'type=page AND creator=currentUser() ORDER BY created DESC';
        const firstPage = await confluenceClient.searchPages(cql, 100, 0);
        const firstAny = firstPage as any;

        if (typeof firstAny.totalSize === 'number') {
          if (!cancelled) setMyConfluenceDocs(firstAny.totalSize);
          return;
        }

        let total = Array.isArray(firstPage.results) ? firstPage.results.length : 0;
        let start = 100;
        let pageGuard = 0;
        let hasNext = Boolean(firstPage._links?.next) || total === 100;

        while (hasNext && pageGuard < 20) {
          const page = await confluenceClient.searchPages(cql, 100, start);
          const count = Array.isArray(page.results) ? page.results.length : 0;
          total += count;
          if (count === 0) break;
          start += 100;
          hasNext = Boolean(page._links?.next) || count === 100;
          pageGuard += 1;
        }

        if (!cancelled) setMyConfluenceDocs(total);
      } catch {
        if (!cancelled) setMyConfluenceDocs(null);
      }
    };

    const refreshMetrics = async () => {
      await Promise.all([fetchJiraMetric(), fetchConfluenceMetric()]);
    };

    refreshMetrics();
    const timer = setInterval(refreshMetrics, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jiraClient, confluenceClient, connectionStatus, metricsRefreshNonce]);

  useInput((input, key) => {
    if (key.ctrl && (input === 'q' || input === 'c')) {
      exit();
    } else if (key.tab && !showHelp) {
      setActiveTab((prev) => (prev + 1) % 2);
    } else if (input === '?') {
      setShowHelp((prev) => !prev);
    } else if (key.escape && showHelp) {
      setShowHelp(false);
    }
  });

  // Memoized callback for Toast dismissal
  const handleDismissToast = useCallback(() => setToast(null), []);
  const scheduleMetricRecheck = useCallback(() => {
    setTimeout(() => setMetricsRefreshNonce(prev => prev + 1), 2500);
    setTimeout(() => setMetricsRefreshNonce(prev => prev + 1), 8000);
  }, []);

  const handleJiraDataChanged = useCallback((openDelta?: number, totalDelta?: number) => {
    const od = openDelta ?? 0;
    const td = totalDelta ?? 0;
    if (od !== 0 || td !== 0) {
      // Direct local adjustment — protected from API overwrites for 30s
      // so the Jira search index has time to catch up
      if (od !== 0) setJiraOpenCount(prev => prev !== null ? Math.max(0, prev + od) : prev);
      if (td !== 0) setJiraTotalCount(prev => prev !== null ? Math.max(0, prev + td) : prev);
      lastMetricAdjustRef.current = Date.now();
      scheduleMetricRecheck();
    } else {
      // No local adjustment — trigger an immediate API refresh
      setMetricsRefreshNonce(prev => prev + 1);
    }
  }, [scheduleMetricRecheck]);

  const helpSections = [
    {
      title: 'Navigation',
      shortcuts: [
        { key: 'Tab', description: 'Switch between Jira/Confluence' },
        { key: '↑/↓', description: 'Navigate items' },
        { key: 'Enter', description: 'Select/Open item' },
        { key: 'Esc', description: 'Go back / Close' },
      ],
    },
    {
      title: 'Actions',
      shortcuts: [
        { key: '/', description: 'Find/Search (where supported)' },
        { key: 'Ctrl+R', description: 'Refresh current item' },
        { key: 'Ctrl+Y', description: 'Copy link' },
        { key: 'Ctrl+O', description: 'Open in browser' },
        { key: 'Ctrl+B', description: 'Toggle bookmark' },
      ],
    },
    {
      title: 'General',
      shortcuts: [
        { key: '?', description: 'Toggle help' },
        { key: 'Ctrl+Q', description: 'Quit application' },
      ],
    },
  ];

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="single" borderColor={te.danger} paddingX={2} paddingY={1}>
          <Text color={te.danger} bold>
            ✗ Error:{' '}
          </Text>
          <Text color={te.fg}>{error}</Text>
        </Box>
      </Box>
    );
  }

  if (!jiraClient || !confluenceClient) {
    return (
      <Box flexDirection="column" padding={2} alignItems="center">
        <Spinner type="braille" label="Validating Jira and Confluence setup..." />
      </Box>
    );
  }

  const tabs = ['Jira', 'Confluence'];
  const shortcuts = [
    { key: 'Tab', description: 'Switch' },
    { key: '?', description: 'Help' },
    { key: 'Ctrl+Q', description: 'Quit' },
  ];

  const currentMode = activeTab === 0 ? 'JIRA' : 'CONFLUENCE';
  const dateTimeLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);
  const metricLabel =
    activeTab === 0
      ? `JIRA: YOUR TICKET STATUS ${jiraOpenCount ?? '--'}/${jiraTotalCount ?? '--'}`
      : `MY DOCS ${myConfluenceDocs ?? '--'}`;

  return (
    <Box flexDirection="column" width="100%" height={terminalHeight}>
      <Header
        title="Sutra"
        version="1.0.0"
        connectionStatus={connectionStatus}
        metricLabel={metricLabel}
        dateTimeLabel={dateTimeLabel}
      />
      <TabBar 
        tabs={tabs} 
        activeTab={activeTab} 
        icons={['🎫', '📄']}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={toast.duration ?? 3000}
          onDismiss={handleDismissToast}
        />
      )}

      {showHelp ? (
        <HelpModal
          visible={showHelp}
          sections={helpSections}
          onClose={() => setShowHelp(false)}
        />
      ) : (
        <Box flexDirection="column" width="100%" flexGrow={1}>
          {activeTab === 0 && (
            <JiraView
              client={jiraClient}
              baseUrl={jiraBaseUrl}
              onJiraDataChanged={handleJiraDataChanged}
            />
          )}
          {activeTab === 1 && <ConfluenceView client={confluenceClient} />}
        </Box>
      )}

      <Footer shortcuts={shortcuts} mode={currentMode} />
    </Box>
  );
}
