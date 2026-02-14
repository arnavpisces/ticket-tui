import React, { useState, useEffect, useCallback } from 'react';
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
import { te } from './theme/te.js';

type ConnectionStatus = 'connected' | 'disconnected' | 'loading';

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [activeTab, setActiveTab] = useState(0);
  const [jiraClient, setJiraClient] = useState<JiraClient | null>(null);
  const [confluenceClient, setConfluenceClient] = useState<ConfluenceClient | null>(
    null
  );
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('loading');
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);

  // Get terminal dimensions for fixed-height rendering
  // Subtract 1 to ensure content doesn't push header off-screen
  const terminalHeight = (stdout?.rows || 24) - 1;

  useEffect(() => {
    try {
      const config = ConfigManager.getConfig();

      if (!config.jira || !config.confluence) {
        setError(
          'Configuration incomplete. Run setup: npx sutra setup'
        );
        setConnectionStatus('disconnected');
        return;
      }

      const jira = new JiraClient(config.jira);
      setJiraClient(jira);
      setJiraBaseUrl(config.jira.baseUrl);

      const confluence = new ConfluenceClient(config.confluence);
      setConfluenceClient(confluence);
      setConnectionStatus('connected');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to initialize clients'
      );
      setConnectionStatus('disconnected');
    }
  }, []);

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
        { key: '/', description: 'Search' },
        { key: 'r', description: 'Refresh data' },
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
        <Spinner type="braille" label="Connecting to Atlassian..." />
      </Box>
    );
  }

  const tabs = ['Jira', 'Confluence'];
  const shortcuts = [
    { key: 'Tab', description: 'Switch' },
    { key: '/', description: 'Search' },
    { key: '?', description: 'Help' },
    { key: 'Ctrl+Q', description: 'Quit' },
  ];

  const currentMode = activeTab === 0 ? 'JIRA' : 'CONFLUENCE';

  return (
    <Box flexDirection="column" width="100%" height={terminalHeight}>
      <Header
        title="Sutra"
        version="1.0.0"
        connectionStatus={connectionStatus}
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
          duration={3000}
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
          {activeTab === 0 && <JiraView client={jiraClient} baseUrl={jiraBaseUrl} />}
          {activeTab === 1 && <ConfluenceView client={confluenceClient} />}
        </Box>
      )}

      <Footer shortcuts={shortcuts} mode={currentMode} />
    </Box>
  );
}
