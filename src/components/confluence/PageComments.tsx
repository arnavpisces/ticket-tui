import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { ConfluenceClient, ConfluencePage, ConfluenceComment } from '../../api/confluence-client.js';
import { ConfluenceConverter } from '../../formatters/confluence-converter.js';
import { openExternalEditor } from '../../utils/external-editor.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { te } from '../../theme/te.js';

export interface PageCommentsProps {
  client: ConfluenceClient;
  page: ConfluencePage;
  onBack: () => void;
}

export function PageComments({ client, page, onBack }: PageCommentsProps) {
  const [comments, setComments] = useState<ConfluenceComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const loadComments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.getComments(page.id);
      setComments(res.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [page.id]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    }
    if (input === 'a') {
      (async () => {
        const result = await openExternalEditor({
          content: '',
          extension: 'md',
        });
        if (!result.success || !result.content?.trim()) return;
        try {
          const storage = ConfluenceConverter.markdownToStorage(result.content);
          await client.addComment(page.id, storage);
          setStatus('✓ Comment added');
          loadComments();
        } catch (err) {
          setStatus(`✗ Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
          setTimeout(() => setStatus(null), 3000);
        }
      })();
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color={te.accentAlt}>Loading comments...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      <Text bold color={te.accentAlt}>Comments for {page.title}</Text>
      {error && <Text color="red">{error}</Text>}
      {status && <Text dimColor>{status}</Text>}

      {comments.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No comments yet.</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <SelectInput
            items={comments.map((c) => ({
              key: c.id,
              label: c.title || 'Comment',
              value: c.id,
            }))}
            onSelect={(item: any) => {
              const idx = comments.findIndex((c) => c.id === item.value);
              if (idx >= 0) setSelectedIndex(idx);
            }}
            onHighlight={(item: any) => {
              const idx = comments.findIndex((c) => c.id === item.value);
              if (idx >= 0) setSelectedIndex(idx);
            }}
            limit={12}
          />
        </Box>
      )}

      {comments[selectedIndex] && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Selected comment:</Text>
          <Text>
            {ConfluenceConverter.storageToMarkdown(
              comments[selectedIndex].body?.storage?.value || ''
            ).slice(0, 800)}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'a', label: 'Add Comment ($EDITOR)' },
            { key: 'Escape', label: 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
