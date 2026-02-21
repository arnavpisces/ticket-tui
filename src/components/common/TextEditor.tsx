import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ShortcutHints } from './ShortcutHints.js';

export interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  placeholder?: string;
  height?: number;
}

export function TextEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = 'Enter text...',
  height = 5,
}: TextEditorProps) {
  const [lines, setLines] = useState<string[]>(value.split('\n'));

  useEffect(() => {
    setLines(value.split('\n'));
  }, [value]);

  const handleInputChange = (input: string) => {
    const newValue = input;
    onChange(newValue);
  };

  useInput((input, key) => {
    if (!onCancel) return;
    if (key.escape || (key.ctrl && input === 'c')) {
      onCancel();
    }
  });

  // For now, use single-line input and handle newlines with \n
  return (
    <Box flexDirection="column" width="100%">
      <Text dimColor>{placeholder}</Text>
      <TextInput
        value={value}
        onChange={handleInputChange}
        onSubmit={() => onSubmit?.()}
      />
      {onCancel && (
        <ShortcutHints
          hints={[
            { key: 'Ctrl+C', label: 'Cancel' },
            { key: 'Escape', label: 'Back' },
          ]}
        />
      )}
    </Box>
  );
}
