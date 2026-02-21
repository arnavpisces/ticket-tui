import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ShortcutHints } from '../common/ShortcutHints.js';

export interface CommentFormProps {
  onSubmit: (comment: string) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

export function CommentForm({
  onSubmit,
  onCancel,
  submitting = false,
}: CommentFormProps) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!comment.trim()) {
      setError('Comment cannot be empty');
      return;
    }

    try {
      setError(null);
      await onSubmit(comment);
      setComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    }
  };

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      {error && <Text color="red">Error: {error}</Text>}

      <Box marginBottom={1}>
        <Text>Add Comment (markdown supported):</Text>
      </Box>

      <TextInput
        value={comment}
        onChange={setComment}
        onSubmit={handleSubmit}
        placeholder="Enter your comment..."
      />

      {submitting && <Text dimColor>Posting...</Text>}

      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Enter', label: 'Submit' },
            { key: 'Ctrl+C', label: 'Cancel' },
          ]}
        />
      </Box>
    </Box>
  );
}
