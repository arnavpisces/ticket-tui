import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { te } from '../../theme/te.js';
import { ShortcutHints } from './ShortcutHints.js';

export interface SavedListItem {
  id: number | string;
  title: string;
  subtitle?: string;
  value: string;
}

export interface SavedListProps {
  title: string;
  items: SavedListItem[];
  onSelect: (value: string) => void;
  onBack: () => void;
  onRemove?: (value: string) => void;
  emptyMessage?: string;
}

export function SavedList({
  title,
  items,
  onSelect,
  onBack,
  onRemove,
  emptyMessage = 'No items yet.',
}: SavedListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    } else if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
    } else if (input === 'd' && onRemove && items[selectedIndex]) {
      onRemove(items[selectedIndex].value);
    }
  });

  if (items.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={te.info}
        paddingX={1}
      >
        <Text color={te.accentAlt}>{title.toUpperCase()}</Text>
        <Box marginTop={1}>
          <Text color={te.muted}>{emptyMessage}</Text>
        </Box>
        <Box marginTop={1}>
          <ShortcutHints
            hints={[{ key: 'Escape', label: 'Back' }]}
          />
        </Box>
      </Box>
    );
  }

  const listItems = items.map((item) => ({
    key: `${item.id}`,
    label: item.subtitle ? `${item.title} — ${item.subtitle}` : item.title,
    value: item.value,
  }));

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderColor={te.info}
      paddingX={1}
    >
      <Text bold color={te.accentAlt}>{title.toUpperCase()}</Text>
      <Box marginTop={1}>
        <SelectInput
          items={listItems}
          onSelect={(item: any) => onSelect(item.value)}
          initialIndex={selectedIndex}
        />
      </Box>
      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Enter', label: 'Open' },
            ...(onRemove ? [{ key: 'd', label: 'Remove' }] : []),
            { key: 'Escape', label: 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
