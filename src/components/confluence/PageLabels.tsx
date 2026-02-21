import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { ConfluenceClient, ConfluencePage, ConfluenceLabel } from '../../api/confluence-client.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { te } from '../../theme/te.js';

export interface PageLabelsProps {
  client: ConfluenceClient;
  page: ConfluencePage;
  onBack: () => void;
}

export function PageLabels({ client, page, onBack }: PageLabelsProps) {
  const [labels, setLabels] = useState<ConfluenceLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const loadLabels = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.getLabels(page.id);
      setLabels(res.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load labels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLabels();
  }, [page.id]);

  useInput((input, key) => {
    if (key.escape) {
      if (adding) {
        setAdding(false);
        setNewLabel('');
      } else {
        onBack();
      }
    }
    if (!adding && input === 'a') {
      setAdding(true);
      setNewLabel('');
    }
    if (!adding && input === 'd' && labels[selectedIndex]) {
      const label = labels[selectedIndex];
      (async () => {
        try {
          await client.removeLabel(page.id, label.name);
          setStatus('✓ Label removed');
          loadLabels();
        } catch (err) {
          setStatus(`✗ ${err instanceof Error ? err.message : 'Failed'}`);
        } finally {
          setTimeout(() => setStatus(null), 3000);
        }
      })();
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color={te.accentAlt}>Loading labels...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      <Text bold color={te.accentAlt}>Labels for {page.title}</Text>
      {error && <Text color="red">{error}</Text>}
      {status && <Text dimColor>{status}</Text>}

      {adding ? (
        <Box marginTop={1}>
          <Text>Add label:</Text>
          <Box borderStyle="round" borderColor={te.accent} paddingX={1}>
            <TextInput
              value={newLabel}
              onChange={setNewLabel}
              onSubmit={async () => {
                if (!newLabel.trim()) return;
                try {
                  await client.addLabel(page.id, newLabel.trim());
                  setStatus('✓ Label added');
                  setAdding(false);
                  setNewLabel('');
                  loadLabels();
                } catch (err) {
                  setStatus(`✗ ${err instanceof Error ? err.message : 'Failed'}`);
                } finally {
                  setTimeout(() => setStatus(null), 3000);
                }
              }}
              placeholder="label-name"
            />
          </Box>
          <Box marginTop={1}>
            <ShortcutHints
              hints={[
                { key: 'Enter', label: 'Add' },
                { key: 'Escape', label: 'Cancel' },
              ]}
            />
          </Box>
        </Box>
      ) : labels.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No labels.</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <SelectInput
            items={labels.map((l) => ({ label: l.name, value: l.name }))}
            onSelect={(item: any) => {
              const idx = labels.findIndex((l) => l.name === item.value);
              if (idx >= 0) setSelectedIndex(idx);
            }}
            onHighlight={(item: any) => {
              const idx = labels.findIndex((l) => l.name === item.value);
              if (idx >= 0) setSelectedIndex(idx);
            }}
            limit={12}
          />
        </Box>
      )}

      {!adding && (
        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: 'a', label: 'Add Label' },
              { key: 'd', label: 'Delete Label' },
              { key: 'Escape', label: 'Back' },
            ]}
          />
        </Box>
      )}
    </Box>
  );
}
