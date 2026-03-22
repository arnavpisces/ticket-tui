import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from '../common/WordTextInput.js';
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

const jqlTemplates = [
  {
    label: 'My open issues',
    value: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
  },
  {
    label: 'Reported by me',
    value: 'reporter = currentUser() ORDER BY created DESC',
  },
  {
    label: 'Recently updated',
    value: 'updated >= -7d ORDER BY updated DESC',
  },
  {
    label: 'In progress work',
    value: 'status in ("To Do", "In Progress") ORDER BY priority DESC, updated DESC',
  },
  {
    label: 'By project key',
    value: 'project = ITOPS ORDER BY created DESC',
  },
  {
    label: 'Title contains text',
    value: 'summary ~ "keyword*" ORDER BY updated DESC',
  },
];

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
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);

  useInput((_input, key) => {
    if (key.ctrl && _input === 'k' && issues === null) {
      setShowSyntaxHelp((prev) => !prev);
      return;
    }

    if (key.escape && showSyntaxHelp) {
      setShowSyntaxHelp(false);
      return;
    }

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
          focus={!showSyntaxHelp}
        />
      </Box>
      {loading && <Text color={te.muted}>Searching...</Text>}
      {error && <Text color={te.danger}>{error}</Text>}
      {showSyntaxHelp && (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          borderColor={te.accent}
          paddingX={1}
        >
          <Text bold color={te.accentAlt}>JQL Syntax Helper</Text>
          <Text color={te.fg}>Examples: project = KEY | assignee = currentUser() | statusCategory != Done</Text>
          <Text color={te.fg}>Operators: =, !=, IN, NOT IN, ~, !~, AND, OR, ORDER BY</Text>
          <Box marginTop={1}>
            <SelectInput
              items={jqlTemplates.map((template) => ({
                key: template.value,
                label: template.label,
                value: template.value,
              }))}
              onSelect={(item: any) => {
                setJql(String(item.value || ''));
                setShowSyntaxHelp(false);
                setError(null);
              }}
            />
          </Box>
          <Box marginTop={1}>
            <ShortcutHints
              hints={[
                { key: 'Enter', label: 'Use Template' },
                { key: 'Escape', label: 'Close Help' },
              ]}
            />
          </Box>
        </Box>
      )}
      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Enter', label: 'Search' },
            { key: 'Ctrl+K', label: 'JQL Help' },
            { key: 'Escape', label: 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
