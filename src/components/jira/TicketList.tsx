import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import { JiraClient, JiraIssue } from '../../api/jira-client.js';
import { PersistentCache } from '../../storage/cache.js';
import { JiraIssueHeader, JiraIssueRow } from './JiraIssueRow.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import TextInput from '../common/WordTextInput.js';
import { te } from '../../theme/te.js';

// Cache for ticket list (5 minute TTL)
const ticketListCache = new PersistentCache<{ issues: JiraIssue[]; total: number }>('jira:ticket-list', 300);
const PAGE_SIZE = 35;

const ticketFilters = [
  {
    id: 'mine-reported',
    label: 'Mine + Reported',
    jql: 'assignee = currentUser() OR reporter = currentUser()',
  },
  {
    id: 'assigned',
    label: 'Assigned to me',
    jql: 'assignee = currentUser()',
  },
  {
    id: 'reported',
    label: 'Reported by me',
    jql: 'reporter = currentUser()',
  },
  {
    id: 'open',
    label: 'My open issues',
    jql: 'assignee = currentUser() AND statusCategory != Done',
  },
  {
    id: 'done',
    label: 'My done issues',
    jql: 'assignee = currentUser() AND statusCategory = Done',
  },
];

const statusFilters = [
  {
    id: 'any',
    label: 'Any status',
    jql: '',
  },
  {
    id: 'todo',
    label: 'To Do',
    jql: 'statusCategory = "To Do"',
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    jql: 'statusCategory = "In Progress"',
  },
  {
    id: 'todo-in-progress',
    label: 'To Do + In Progress',
    jql: 'statusCategory in ("To Do", "In Progress")',
  },
  {
    id: 'done',
    label: 'Done',
    jql: 'statusCategory = Done',
  },
];

export interface TicketListProps {
  client: JiraClient;
  onSelectTicket: (key: string) => void;
  onCancel: () => void;
}

export function TicketList({ client, onSelectTicket, onCancel }: TicketListProps) {
  const { stdout } = useStdout();
  const [tickets, setTickets] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<'list' | 'filters' | 'status-filters'>('list');
  const [activeFilterId, setActiveFilterId] = useState(ticketFilters[0].id);
  const [activeStatusFilterId, setActiveStatusFilterId] = useState(statusFilters[0].id);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const activeFilter = ticketFilters.find((item) => item.id === activeFilterId) || ticketFilters[0];
  const activeStatusFilter =
    statusFilters.find((item) => item.id === activeStatusFilterId) || statusFilters[0];
  const filteredTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tickets;

    const multiTerms = /[\/|,]/.test(query);
    const terms = multiTerms
      ? query.split(/[\/|,]+/).map((part) => part.trim()).filter(Boolean)
      : [query];
    if (terms.length === 0) return tickets;

    return tickets.filter((ticket) => {
      const haystack = `${ticket.key} ${ticket.fields.summary || ''}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
  }, [tickets, searchQuery]);

  useEffect(() => {
    const fetchTickets = async () => {
      const startAt = pageIndex * PAGE_SIZE;
      const scopedStatusClause = activeStatusFilter.jql ? ` AND (${activeStatusFilter.jql})` : '';
      const scopedJql = `(${activeFilter.jql})${scopedStatusClause} ORDER BY created DESC`;

      // Check cache first
      const cacheKey = `ticket-list:${activeFilter.id}:${activeStatusFilter.id}:${startAt}:${PAGE_SIZE}`;
      const cached = ticketListCache.get(cacheKey);
      if (cached) {
        setTickets(cached.issues);
        setTotal(cached.total);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await client.searchIssues(scopedJql, PAGE_SIZE, startAt);
        setTickets(result.issues);
        setTotal(typeof result.total === 'number' ? result.total : startAt + result.issues.length);
        // Cache the results
        ticketListCache.set(cacheKey, {
          issues: result.issues,
          total: typeof result.total === 'number' ? result.total : startAt + result.issues.length,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tickets');
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [client, pageIndex, activeFilter.id, activeFilter.jql, activeStatusFilter.id, activeStatusFilter.jql]);

  const hasPrevPage = pageIndex > 0;
  const hasNextPage = (pageIndex + 1) * PAGE_SIZE < total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Keep list height within app viewport so the header never gets pushed off-screen.
  const listLimit = Math.max(6, Math.min(15, (stdout?.rows || 24) - 12));

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
      if (mode === 'filters' || mode === 'status-filters') {
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

    if (input.toLowerCase() === 'f') {
      setMode('filters');
      return;
    }
    if (input.toLowerCase() === 's') {
      setMode('status-filters');
      return;
    }
    if ((input === 'n' || input === ']') && hasNextPage && !loading) {
      setPageIndex(prev => prev + 1);
      return;
    }
    if ((input === 'p' || input === '[') && hasPrevPage && !loading) {
      setPageIndex(prev => Math.max(0, prev - 1));
    }
  });

  if (mode === 'filters') {
    return (
      <Box
        flexDirection="column"
        width="100%"
        borderStyle="single"
        borderColor={te.info}
        paddingX={1}
      >
        <Text bold color={te.accentAlt}>BROWSE TICKETS • FILTERS</Text>
        <Box marginTop={1}>
          <SelectInput
            items={ticketFilters.map((filter) => ({
              key: filter.id,
              label: `${filter.label}${filter.id === activeFilter.id ? ' (Active)' : ''}`,
              value: filter.id,
            }))}
            onSelect={(item: any) => {
              if (item.value !== activeFilter.id) {
                setActiveFilterId(item.value);
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

  if (mode === 'status-filters') {
    return (
      <Box
        flexDirection="column"
        width="100%"
        borderStyle="single"
        borderColor={te.info}
        paddingX={1}
      >
        <Text bold color={te.accentAlt}>BROWSE TICKETS • STATUS FILTERS</Text>
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

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text>Loading tickets...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <Box marginTop={1}>
          <ShortcutHints hints={[{ key: 'Escape', label: 'Back' }]} />
        </Box>
      </Box>
    );
  }

  const items = filteredTickets.map((ticket) => ({
    key: ticket.key,
    label: ticket.key,
    value: ticket.key,
    issue: ticket,
  }));

  if (items.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">
          {searchQuery.trim().length > 0
            ? `No tickets matched "${searchQuery}" on this page.`
            : 'No tickets found in your Jira instance.'}
        </Text>
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
              ? 'Try a shorter ticket key or title keyword.'
              : 'Create a ticket in Jira first, then come back here.'}
          </Text>
        </Box>
        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: '/', label: 'Search' },
              { key: 'Escape', label: searchActive ? 'Clear/Back' : 'Back' },
            ]}
          />
        </Box>
      </Box>
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
      <Box marginBottom={1}>
        <Text bold color={te.accentAlt}>BROWSE TICKETS</Text>
        <Text color={te.fg}>{`  ${activeFilter.label}  |  Status: ${activeStatusFilter.label}  |  Page ${pageIndex + 1}/${totalPages} | ${total} total`}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={te.fg}>Search (/): </Text>
        <TextInput
          value={searchQuery}
          onChange={setSearchQuery}
          onSubmit={() => setSearchActive(false)}
          placeholder="ticket key or title (itops/sre)"
          focus={searchActive}
        />
      </Box>
      {searchQuery.trim().length > 0 && (
        <Box marginBottom={1}>
          <Text color={te.muted}>{`Showing ${filteredTickets.length}/${tickets.length} tickets on this page`}</Text>
        </Box>
      )}
      <Box marginBottom={1}>
        <JiraIssueHeader />
      </Box>

      <SelectInput
        items={items}
        onSelect={(item: any) => onSelectTicket(item.value)}
        limit={listLimit}
        itemComponent={JiraIssueRow as any}
      />

      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Enter', label: 'Select' },
            { key: 'n or ]', label: 'Next Page' },
            { key: 'p or [', label: 'Prev Page' },
            { key: '/', label: 'Search' },
            { key: 'f', label: 'Filters' },
            { key: 's', label: 'Status' },
            { key: 'Escape', label: searchActive ? 'Clear/Back' : 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
