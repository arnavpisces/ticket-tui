import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { JiraIssue } from '../../api/jira-client.js';
import { getJiraStatusColor, getJiraTypeColor, getJiraPriorityColor } from '../../utils/jira-colors.js';
import { te } from '../../theme/te.js';

interface ColumnWidths {
  key: number;
  status: number;
  type: number;
  priority: number;
  summary: number;
}

const MIN_SUMMARY_WIDTH = 20;
const BASE_PADDING = 4; // indicator + spacing
const ROW_PREFIX = '  '; // Align table header with SelectInput row prefix (e.g. "❯ ")

const padRight = (value: string, width: number) => {
  if (value.length >= width) return value.slice(0, width);
  return value.padEnd(width);
};

const truncate = (value: string, width: number) => {
  if (width <= 0) return '';
  if (value.length <= width) return value;
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
};

const getColumnWidths = (columns: number): ColumnWidths => {
  const key = 10;
  const status = 12;
  const type = 10;
  const priority = 9;
  const summary = Math.max(MIN_SUMMARY_WIDTH, columns - (key + status + type + priority + BASE_PADDING));
  return { key, status, type, priority, summary };
};

export function JiraIssueHeader() {
  const { stdout } = useStdout();
  const width = Math.max(40, (stdout?.columns || 80) - ROW_PREFIX.length);
  const cols = getColumnWidths(width);
  const headerLine = `${ROW_PREFIX}${padRight('KEY', cols.key)} ${padRight('STATUS', cols.status)} ${padRight('TYPE', cols.type)} ${padRight('PRIORITY', cols.priority)} ${padRight('TITLE', cols.summary)}`;

  return (
    <Box>
      <Text backgroundColor={te.accent} color="black" bold>
        {headerLine}
      </Text>
    </Box>
  );
}

export function JiraIssueRow({ issue, isSelected }: { issue: JiraIssue; isSelected: boolean }) {
  const { stdout } = useStdout();
  const width = stdout?.columns || 80;
  const cols = getColumnWidths(width);

  const status = issue.fields.status?.name || '';
  const type = issue.fields.issuetype?.name || '';
  const priority = issue.fields.priority?.name || '';
  const summary = issue.fields.summary || '';

  const statusColor = getJiraStatusColor(status);
  const typeColor = getJiraTypeColor(type);
  const priorityColor = getJiraPriorityColor(priority);
  const keyBg = isSelected ? te.accentAlt : undefined;
  const keyColor = isSelected ? 'black' : te.accentAlt;

  return (
    <Box>
      <Text color={keyColor} backgroundColor={keyBg} bold={isSelected}>
        {padRight(issue.key, cols.key)}{' '}
      </Text>
      <Text color={statusColor} bold={isSelected}>
        {padRight(status || '—', cols.status)}{' '}
      </Text>
      <Text color={typeColor} bold={isSelected}>
        {padRight(type || '—', cols.type)}{' '}
      </Text>
      <Text color={priorityColor} bold={isSelected}>
        {padRight(priority || '—', cols.priority)}{' '}
      </Text>
      <Text color={isSelected ? te.accentAlt : te.fg} bold={isSelected}>
        {truncate(summary, cols.summary)}
      </Text>
    </Box>
  );
}
