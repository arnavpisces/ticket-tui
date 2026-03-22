import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { JiraClient, JiraIssue } from '../../api/jira-client.js';
import { PersistentCache } from '../../storage/cache.js';
import { IssueList } from './IssueList.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { te } from '../../theme/te.js';

interface QuickFilterResult {
  issues: JiraIssue[];
  total: number;
  truncated: boolean;
}

const QUICK_FETCH_LIMIT = 140;
const quickCache = new PersistentCache<QuickFilterResult>('jira:quick', 300);
const quickInFlight = new Map<string, Promise<QuickFilterResult>>();

function normalizeCachedQuickResult(value: unknown): QuickFilterResult | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    return {
      issues: value as JiraIssue[],
      total: value.length,
      truncated: false,
    };
  }

  if (typeof value !== 'object') return null;
  const candidate = value as Partial<QuickFilterResult>;
  if (!Array.isArray(candidate.issues)) return null;

  return {
    issues: candidate.issues as JiraIssue[],
    total: typeof candidate.total === 'number' ? candidate.total : candidate.issues.length,
    truncated: typeof candidate.truncated === 'boolean'
      ? candidate.truncated
      : (typeof candidate.total === 'number' ? candidate.total > candidate.issues.length : false),
  };
}

const filters = [
  { label: 'Assigned to me', jql: 'assignee = currentUser() ORDER BY updated DESC' },
  { label: 'Reported by me', jql: 'reporter = currentUser() ORDER BY updated DESC' },
  { label: 'My open issues', jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC' },
  { label: 'Recently updated', jql: 'updated >= -7d ORDER BY updated DESC' },
  { label: 'Recently created', jql: 'created >= -7d ORDER BY created DESC' },
];

export interface QuickFiltersProps {
  client: JiraClient;
  onSelectIssue: (issueKey: string, context?: QuickFilterContext) => void;
  onCancel: () => void;
  initialContext?: QuickFilterContext | null;
  onContextChange?: (context: QuickFilterContext | null) => void;
}

export interface QuickFilterContext {
  filterJql: string;
}

export function QuickFilters({
  client,
  onSelectIssue,
  onCancel,
  initialContext,
  onContextChange,
}: QuickFiltersProps) {
  const [selectedFilter, setSelectedFilter] = useState<typeof filters[0] | null>(null);
  const [result, setResult] = useState<QuickFilterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTick, setLoadingTick] = useState(0);
  const hydratedFromInitialRef = useRef(false);

  const loadingDots = useMemo(() => {
    if (!loading) return '';
    const frame = loadingTick % 4;
    if (frame === 0) return '';
    if (frame === 1) return '.';
    if (frame === 2) return '..';
    return '...';
  }, [loading, loadingTick]);

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => {
      setLoadingTick((prev) => prev + 1);
    }, 250);
    return () => clearInterval(timer);
  }, [loading]);

  const fetchFastIssues = async (jql: string): Promise<QuickFilterResult> => {
    const response = await client.searchIssues(jql, QUICK_FETCH_LIMIT, 0);
    const issues = Array.isArray(response.issues) ? response.issues : [];
    const total = typeof response.total === 'number'
      ? Math.max(response.total, issues.length)
      : issues.length;

    return {
      issues,
      total,
      truncated: total > issues.length,
    };
  };

  const getFilterResult = async (jql: string): Promise<QuickFilterResult> => {
    const cached = normalizeCachedQuickResult(quickCache.get(jql) as unknown);
    if (cached) {
      // Rewrite normalized value to keep cache format consistent after migration.
      quickCache.set(jql, cached);
      return cached;
    }

    const inflight = quickInFlight.get(jql);
    if (inflight) {
      return inflight;
    }

    const request = fetchFastIssues(jql)
      .then((data) => {
        quickCache.set(jql, data);
        return data;
      })
      .finally(() => {
        quickInFlight.delete(jql);
      });

    quickInFlight.set(jql, request);
    return request;
  };

  useInput((_input, key) => {
    if (key.escape && !selectedFilter) {
      onCancel();
    } else if (key.escape && selectedFilter) {
      setSelectedFilter(null);
      setResult(null);
      onContextChange?.(null);
    }
  });

  useEffect(() => {
    // Warm "Reported by me" in background since it's a common, potentially heavy query.
    const prefetch = filters.find((filter) => filter.label === 'Reported by me');
    if (!prefetch) return;
    const key = prefetch.jql;
    if (normalizeCachedQuickResult(quickCache.get(key) as unknown) || quickInFlight.has(key)) return;
    void getFilterResult(key).catch(() => {
      // Ignore prefetch failures; normal flow still handles errors.
    });
  }, [client]);

  useEffect(() => {
    if (hydratedFromInitialRef.current) return;
    if (!initialContext?.filterJql) return;
    const filter = filters.find((item) => item.jql === initialContext.filterJql);
    if (!filter) return;
    hydratedFromInitialRef.current = true;
    void runFilter(filter);
  }, [initialContext]);

  const runFilter = async (filter: typeof filters[0]) => {
    setSelectedFilter(filter);
    onContextChange?.({ filterJql: filter.jql });
    setLoading(true);
    setError(null);
    setLoadingTick(0);

    try {
      const filterResult = await getFilterResult(filter.jql);
      setResult(filterResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  };

  if (selectedFilter && result) {
    const title = result.truncated
      ? `Quick Filter: ${selectedFilter.label} (latest ${result.issues.length} of ${result.total})`
      : `Quick Filter: ${selectedFilter.label}`;

    return (
      <IssueList
        title={title}
        issues={result.issues}
        onSelect={(issueKey) =>
          onSelectIssue(issueKey, {
            filterJql: selectedFilter.jql,
          })
        }
        onCancel={() => {
          setSelectedFilter(null);
          setResult(null);
          onContextChange?.(null);
        }}
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
      <Text bold color={te.accentAlt}>QUICK FILTERS</Text>
      <Box marginTop={1}>
        <SelectInput
          items={filters.map((f) => ({ key: f.jql, label: f.label, value: f.jql }))}
          onSelect={(item: any) => {
            const filter = filters.find((f) => f.jql === item.value) || filters[0];
            runFilter(filter);
          }}
        />
      </Box>
      {loading && <Text color={te.muted}>{`Loading${loadingDots}`}</Text>}
      {error && <Text color={te.danger}>{error}</Text>}
      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Enter', label: 'Select' },
            { key: 'Escape', label: 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
