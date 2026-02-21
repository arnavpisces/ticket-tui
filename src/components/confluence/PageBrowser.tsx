import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { ConfluenceClient } from '../../api/confluence-client.js';
import { PersistentCache } from '../../storage/cache.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { te } from '../../theme/te.js';

interface SearchItem {
  label: string;
  value: string;
  key: string;
}

const PAGE_SIZE = 35;
const searchCache = new PersistentCache<{ items: SearchItem[]; hasNext: boolean }>('confluence:search', 300);

export interface PageBrowserProps {
  client: ConfluenceClient;
  onPageSelect: (pageId: string) => void;
  onCancel: () => void;
}

export function PageBrowser({ client, onPageSelect, onCancel }: PageBrowserProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);

  const normalizedQuery = useMemo(() => query.trim().replace(/\s+/g, ' '), [query]);
  const hasPrevPage = pageIndex > 0;
  const canSearch = normalizedQuery.length >= 2;

  useEffect(() => {
    setPageIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setError(null);
      setHasNextPage(false);
      setLoading(false);
      return;
    }

    const fetchPage = async () => {
      const start = pageIndex * PAGE_SIZE;
      const cacheKey = `${normalizedQuery.toLowerCase()}:${start}`;
      const cached = searchCache.get(cacheKey);
      if (cached) {
        setResults(cached.items);
        setHasNextPage(cached.hasNext);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const safeQuery = normalizedQuery.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const cql = `type=page AND (title ~ "${safeQuery}" OR text ~ "${safeQuery}") ORDER BY lastmodified DESC`;
        const result = await client.searchPages(cql, PAGE_SIZE, start);

        const items = (result.results || [])
          .map((item: any) => {
            const content = item.content || item;
            const spaceName = item.resultGlobalContainer?.title || item.space?.name || '';
            const id = content.id || item.id;
            const title = content.title || item.title || 'Untitled';
            return {
              label: `${title}${spaceName ? ` (${spaceName})` : ''}`,
              value: id,
              key: `page-${id}`,
            };
          })
          .filter((item: SearchItem) => Boolean(item.value));

        const nextAvailable = Boolean(result._links?.next) || items.length === PAGE_SIZE;
        setResults(items);
        setHasNextPage(nextAvailable);
        searchCache.set(cacheKey, { items, hasNext: nextAvailable });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
        setHasNextPage(false);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchPage, 300);
    return () => clearTimeout(timer);
  }, [client, normalizedQuery, pageIndex, canSearch]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (((key.ctrl && input === 'n') || key.pageDown) && hasNextPage && !loading && canSearch) {
      setPageIndex(prev => prev + 1);
      return;
    }

    if (((key.ctrl && input === 'p') || key.pageUp) && hasPrevPage && !loading && canSearch) {
      setPageIndex(prev => Math.max(0, prev - 1));
    }
  });

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderColor={te.info}
      paddingX={1}
    >
      <Text bold color={te.accentAlt}>SEARCH CONFLUENCE PAGES</Text>
      <Box marginY={1} borderStyle="single" borderColor={te.muted} paddingX={1}>
        <Text color={te.accent}>QUERY </Text>
        <TextInput value={query} onChange={setQuery} placeholder="Type title..." />
      </Box>

      {!canSearch ? (
        <Text color={te.muted}>Type at least 2 characters to search.</Text>
      ) : loading ? (
        <Text color={te.muted}>Loading...</Text>
      ) : error ? (
        <Text color={te.danger}>{error}</Text>
      ) : (
        <Text color={te.muted}>{`Page ${pageIndex + 1}${hasNextPage ? '+' : ''} | ${results.length} item(s)`}</Text>
      )}

      {results.length > 0 && (
        <Box marginTop={1}>
          <SelectInput
            items={results}
            onSelect={(item: any) => onPageSelect(item.value)}
            limit={15}
          />
        </Box>
      )}

      {canSearch && !loading && !error && results.length === 0 && (
        <Box marginTop={1}>
          <Text color={te.muted}>No results found.</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Enter', label: 'Select' },
            { key: 'Ctrl+N/PageDown', label: 'Next Page' },
            { key: 'Ctrl+P/PageUp', label: 'Prev Page' },
            { key: 'Escape', label: 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
