import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import { JiraIssue } from '../../api/jira-client.js';
import { JiraIssueHeader, JiraIssueRow } from './JiraIssueRow.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import TextInput from '../common/WordTextInput.js';
import { te } from '../../theme/te.js';

export interface IssueListProps {
  title: string;
  issues: JiraIssue[];
  onSelect: (issueKey: string) => void;
  onCancel: () => void;
}

const statusFilters = [
  { id: 'any', label: 'Any status' },
  { id: 'todo', label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
  { id: 'todo-in-progress', label: 'To Do + In Progress' },
] as const;

function classifyIssueStatus(issue: JiraIssue): 'todo' | 'in-progress' | 'done' {
  const statusName = String(issue.fields.status?.name || '').toLowerCase();
  const categoryKey = String((issue.fields.status as any)?.statusCategory?.key || '').toLowerCase();
  const categoryName = String((issue.fields.status as any)?.statusCategory?.name || '').toLowerCase();

  if (
    categoryKey === 'done' ||
    categoryName.includes('done') ||
    /(done|complete|completed|closed|resolved)/.test(statusName)
  ) {
    return 'done';
  }

  if (
    categoryKey === 'indeterminate' ||
    categoryName.includes('progress') ||
    /(progress|review|block|hold|qa|testing)/.test(statusName)
  ) {
    return 'in-progress';
  }

  return 'todo';
}

export function IssueList({ title, issues, onSelect, onCancel }: IssueListProps) {
  const { stdout } = useStdout();
  const PAGE_SIZE = 35;
  const [mode, setMode] = useState<'list' | 'status-filters'>('list');
  const [activeStatusFilterId, setActiveStatusFilterId] = useState<(typeof statusFilters)[number]['id']>('any');
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const activeStatusFilter = statusFilters.find((filter) => filter.id === activeStatusFilterId) || statusFilters[0];
  const statusFilteredIssues = useMemo(() => {
    if (activeStatusFilterId === 'any') return issues;
    if (activeStatusFilterId === 'todo-in-progress') {
      return issues.filter((issue) => {
        const status = classifyIssueStatus(issue);
        return status === 'todo' || status === 'in-progress';
      });
    }
    return issues.filter((issue) => classifyIssueStatus(issue) === activeStatusFilterId);
  }, [issues, activeStatusFilterId]);
  const filteredIssues = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return statusFilteredIssues;

    const multiTerms = /[\/|,]/.test(query);
    const terms = multiTerms
      ? query.split(/[\/|,]+/).map((part) => part.trim()).filter(Boolean)
      : [query];
    if (terms.length === 0) return statusFilteredIssues;

    return statusFilteredIssues.filter((issue) => {
      const haystack = `${issue.key} ${issue.fields.summary || ''}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
  }, [searchQuery, statusFilteredIssues]);
  const hasPrevPage = pageIndex > 0;
  const hasNextPage = (pageIndex + 1) * PAGE_SIZE < filteredIssues.length;
  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / PAGE_SIZE));
  const pageIssues = filteredIssues.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const listLimit = Math.max(6, Math.min(15, (stdout?.rows || 24) - 12));

  useEffect(() => {
    setPageIndex(0);
  }, [issues, activeStatusFilterId, searchQuery]);

  useInput((input, key) => {
    if (key.escape && searchActive) {
      if (searchQuery.trim().length > 0) {
        setSearchQuery('');
      } else {
        setSearchActive(false);
      }
      return;
    }
    if (key.escape) {
      if (mode === 'status-filters') {
        setMode('list');
        return;
      }
      onCancel();
      return;
    }
    if (mode !== 'list') return;

    if (input === '/') {
      setSearchActive(true);
      return;
    }

    if (searchActive && !key.upArrow && !key.downArrow && !key.return) {
      return;
    }

    if (input.toLowerCase() === 'f' || input.toLowerCase() === 's') {
      setMode('status-filters');
      return;
    }
    if ((input === 'n' || input === ']') && hasNextPage) {
      setPageIndex(prev => prev + 1);
      return;
    }
    if ((input === 'p' || input === '[') && hasPrevPage) {
      setPageIndex(prev => Math.max(0, prev - 1));
    }
  });

  if (mode === 'status-filters') {
    return (
      <Box
        flexDirection="column"
        width="100%"
        borderStyle="single"
        borderColor={te.info}
        paddingX={1}
      >
        <Text bold color={te.accentAlt}>TICKET STATUS FILTERS</Text>
        <Box marginTop={1}>
          <SelectInput
            items={statusFilters.map((filter) => ({
              key: filter.id,
              label: `${filter.label}${filter.id === activeStatusFilter.id ? ' (Active)' : ''}`,
              value: filter.id,
            }))}
            onSelect={(item: any) => {
              if (item.value !== activeStatusFilter.id) {
                setActiveStatusFilterId(item.value);
                setPageIndex(0);
              }
              setMode('list');
            }}
          />
        </Box>
        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: 'Enter', label: 'Apply Filter' },
              { key: 'Escape', label: 'Back' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  if (filteredIssues.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">{title}</Text>
        <Box marginTop={1}>
          <Text color={te.fg}>Search (/): </Text>
          <TextInput
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={() => setSearchActive(false)}
            placeholder="ticket key or title (itops/sre)"
            focus={searchActive}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            {searchQuery.trim().length > 0
              ? `No issues found for "${searchQuery}" with status ${activeStatusFilter.label}.`
              : `No issues found for status filter: ${activeStatusFilter.label}`}
          </Text>
        </Box>
        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: '/', label: 'Search' },
              { key: 'f or s', label: 'Status Filter' },
              { key: 'Escape', label: searchActive ? 'Clear/Back' : 'Back' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  const items = pageIssues.map((issue) => ({
    key: issue.key,
    label: issue.key,
    value: issue.key,
    issue,
  }));

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderColor={te.info}
      paddingX={1}
    >
      <Box>
        <Text bold color={te.accentAlt}>{title.toUpperCase()}</Text>
      </Box>
      <Box>
        <Text color={te.fg}>{`Status: ${activeStatusFilter.label} | Page ${pageIndex + 1}/${totalPages} | ${filteredIssues.length} total`}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={te.fg}>Search (/): </Text>
        <TextInput
          value={searchQuery}
          onChange={setSearchQuery}
          onSubmit={() => setSearchActive(false)}
          placeholder="ticket key or title (itops/sre)"
          focus={searchActive}
        />
      </Box>
      <Box marginTop={1}>
        <JiraIssueHeader />
      </Box>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item: any) => onSelect(item.value)}
          limit={listLimit}
          itemComponent={JiraIssueRow as any}
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Enter', label: 'Select' },
            { key: 'n or ]', label: 'Next Page' },
            { key: 'p or [', label: 'Prev Page' },
            { key: '/', label: 'Search' },
            { key: 'f or s', label: 'Status Filter' },
            { key: 'Escape', label: searchActive ? 'Clear/Back' : 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
