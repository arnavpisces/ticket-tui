import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ShortcutHints } from '../common/ShortcutHints.js';

export interface TicketEditorProps {
  title: string;
  description: string;
  onSave: (title: string, description: string) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

export function TicketEditor({
  title: initialTitle,
  description: initialDescription,
  onSave,
  onCancel,
  saving = false,
}: TicketEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [editingField, setEditingField] = useState<'title' | 'description'>('title');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      setError(null);
      await onSave(title, description);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.ctrl && input === 's') {
      handleSave();
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      {error && <Text color="red">Error: {error}</Text>}

      <Box marginY={1} flexDirection="column" width="100%">
        <Text bold>Edit Title:</Text>
        {editingField === 'title' ? (
          <TextInput
            value={title}
            onChange={setTitle}
            onSubmit={() => setEditingField('description')}
          />
        ) : (
          <Text>{title}</Text>
        )}
      </Box>

      <Box marginY={1} flexDirection="column" width="100%">
        <Text bold>Edit Description:</Text>
        {editingField === 'description' ? (
          <TextInput
            value={description}
            onChange={setDescription}
            onSubmit={() => handleSave()}
          />
        ) : (
          <Text>{description.slice(0, 100)}</Text>
        )}
      </Box>

      {saving && <Text dimColor>Saving...</Text>}

      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Ctrl+S', label: 'Save' },
            { key: 'Escape', label: 'Cancel' },
          ]}
        />
      </Box>
    </Box>
  );
}
