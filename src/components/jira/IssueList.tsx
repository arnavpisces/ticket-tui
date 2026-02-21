import React, { useEffect, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import { JiraIssue } from '../../api/jira-client.js';
import { JiraIssueHeader, JiraIssueRow } from './JiraIssueRow.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { te } from '../../theme/te.js';

export interface IssueListProps {
  title: string;
  issues: JiraIssue[];
  onSelect: (issueKey: string) => void;
  onCancel: () => void;
}

export function IssueList({ title, issues, onSelect, onCancel }: IssueListProps) {
  const { stdout } = useStdout();
  const PAGE_SIZE = 35;
  const [pageIndex, setPageIndex] = useState(0);
  const hasPrevPage = pageIndex > 0;
  const hasNextPage = (pageIndex + 1) * PAGE_SIZE < issues.length;
  const totalPages = Math.max(1, Math.ceil(issues.length / PAGE_SIZE));
  const pageIssues = issues.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const listLimit = Math.max(6, Math.min(15, (stdout?.rows || 24) - 12));

  useEffect(() => {
    setPageIndex(0);
  }, [issues]);

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if ((_input === 'n' || _input === ']') && hasNextPage) {
      setPageIndex(prev => prev + 1);
      return;
    }
    if ((_input === 'p' || _input === '[') && hasPrevPage) {
      setPageIndex(prev => Math.max(0, prev - 1));
    }
  });

  if (issues.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">{title}</Text>
        <Box marginTop={1}>
          <Text dimColor>No issues found.</Text>
        </Box>
        <Box marginTop={1}>
          <ShortcutHints hints={[{ key: 'Escape', label: 'Back' }]} />
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
        <Text color={te.fg}>{`Page ${pageIndex + 1}/${totalPages} | ${issues.length} total`}</Text>
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
            { key: 'Escape', label: 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
