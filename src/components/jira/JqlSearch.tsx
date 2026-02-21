import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { JiraClient, JiraIssue } from '../../api/jira-client.js';
import { PersistentCache } from '../../storage/cache.js';
import { IssueList } from './IssueList.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { te } from '../../theme/te.js';

const jqlCache = new PersistentCache<JiraIssue[]>('jira:jql', 300);

export interface JqlSearchProps {
  client: JiraClient;
  onSelectIssue: (issueKey: string) => void;
  onCancel: () => void;
}

function toFriendlyJqlError(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  const normalized = raw.toLowerCase();

  // Jira returns 400 for invalid JQL in both enhanced and fallback endpoints.
  if (
    normalized.includes('http 400') ||
    normalized.includes('bad request') ||
    normalized.includes('jql') ||
    normalized.includes('syntax') ||
    normalized.includes('parse')
  ) {
    return 'Wrong query. Kindly check your JQL syntax and try again.';
  }

  return raw || 'Search failed. Please try again.';
}

export function JqlSearch({ client, onSelectIssue, onCancel }: JqlSearchProps) {
  const [jql, setJql] = useState('');
  const [issues, setIssues] = useState<JiraIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useInput((_input, key) => {
    if (key.escape && issues === null) {
      onCancel();
    } else if (key.escape && issues !== null) {
      setIssues(null);
    }
  });

  const runSearch = async () => {
    if (!jql.trim()) return;
    setLoading(true);
    setError(null);

    const cacheKey = jql.trim();
    const cached = jqlCache.get(cacheKey);
    if (cached) {
      setIssues(cached);
      setLoading(false);
      return;
    }

    try {
      const res = await client.searchIssues(jql, 50);
      setIssues(res.issues);
      jqlCache.set(cacheKey, res.issues);
    } catch (err) {
      setError(toFriendlyJqlError(err));
    } finally {
      setLoading(false);
    }
  };

  if (issues !== null) {
    return (
      <IssueList
        title={`Results for JQL: ${jql}`}
        issues={issues}
        onSelect={onSelectIssue}
        onCancel={() => setIssues(null)}
      />
    );
  }

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderColor={te.info}
      paddingX={1}
    >
      <Text bold color={te.accentAlt}>JQL SEARCH</Text>
      <Box marginY={1}>
        <Text color={te.muted}>Enter a JQL query and press Enter.</Text>
      </Box>
      <Box borderStyle="single" borderColor={te.muted} paddingX={1}>
        <TextInput
          value={jql}
          onChange={setJql}
          onSubmit={runSearch}
          placeholder='e.g. assignee = currentUser() AND statusCategory != Done'
        />
      </Box>
      {loading && <Text color={te.muted}>Searching...</Text>}
      {error && <Text color={te.danger}>{error}</Text>}
      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Enter', label: 'Search' },
            { key: 'Escape', label: 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
