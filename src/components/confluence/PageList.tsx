import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { ConfluenceClient } from '../../api/confluence-client.js';
import { PersistentCache } from '../../storage/cache.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { te } from '../../theme/te.js';

// Cache for page list (5 minute TTL)
const pageListCache = new PersistentCache<{
  pages: Array<{ id: string; title: string; space?: { name: string } }>;
  hasNext: boolean;
}>(
  'confluence:page-list',
  300
);
const PAGE_SIZE = 35;

export interface PageListProps {
  client: ConfluenceClient;
  onSelectPage: (pageId: string) => void;
  onCancel: () => void;
}

export function PageList({ client, onSelectPage, onCancel }: PageListProps) {
  const [pages, setPages] = useState<Array<{ id: string; title: string; space?: { name: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const hasPrevPage = pageIndex > 0;

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
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

  useEffect(() => {
    const fetchPages = async () => {
      const start = pageIndex * PAGE_SIZE;

      // Check cache first
      const cacheKey = `page-list:${start}:${PAGE_SIZE}`;
      const cached = pageListCache.get(cacheKey);
      if (cached) {
        setPages(cached.pages);
        setHasNextPage(cached.hasNext);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Search for all pages, ordered by last modified
        const cql = 'type=page ORDER BY lastmodified DESC';
        const result = await client.searchPages(cql, PAGE_SIZE, start);

        // Extract page data from search results (handle different API response formats)
        const extractedPages = (result.results || []).map((item: any) => {
          // The search API wraps content in a 'content' object
          const content = item.content || item;
          return {
            id: content.id || item.id,
            title: content.title || item.title,
            space: item.resultGlobalContainer
              ? { name: item.resultGlobalContainer.title }
              : item.space,
          };
        }).filter((p: any) => p.id && p.title);

        setPages(extractedPages);
        const nextAvailable = Boolean(result._links?.next) || extractedPages.length === PAGE_SIZE;
        setHasNextPage(nextAvailable);
        // Cache the results
        pageListCache.set(cacheKey, {
          pages: extractedPages,
          hasNext: nextAvailable,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch pages');
      } finally {
        setLoading(false);
      }
    };

    fetchPages();
  }, [client, pageIndex]);

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">⏳ Loading pages...</Text>
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

  // Create items with unique keys using index as fallback for duplicates
  const items = pages.map((page, index) => ({
    key: `page-${page.id}-${index}`, // Unique key for React
    label: `${page.space?.name ? `[${page.space.name}] ` : ''}${page.title.slice(0, 50)}${page.title.length > 50 ? '...' : ''}`,
    value: page.id,
  }));

  if (items.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">No pages found on this page.</Text>
        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: 'n or ]', label: 'Next Page' },
              { key: 'p or [', label: 'Prev Page' },
              { key: 'Escape', label: 'Back' },
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
        <Text bold color={te.accentAlt}>BROWSE PAGES</Text>
        <Text color={te.muted}>{`  Page ${pageIndex + 1}${hasNextPage ? '+' : ''}`}</Text>
      </Box>

      <SelectInput
        items={items}
        onSelect={(item: any) => onSelectPage(item.value)}
        limit={15}
      />

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
