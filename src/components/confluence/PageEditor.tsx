import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { ConfluencePage } from '../../api/confluence-client.js';
import { ConfluenceConverter } from '../../formatters/confluence-converter.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { te } from '../../theme/te.js';

export interface PageEditorProps {
  page: ConfluencePage;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

/**
 * Simplified Page Editor - focuses on simple text editing.
 * For complex editing, use the external editor (press 'e' in PageViewer).
 */
export function PageEditor({
  page,
  onSave,
  onCancel,
  saving = false,
}: PageEditorProps) {
  const initialMarkdown = ConfluenceConverter.storageToMarkdown(
    page.body.storage.value
  );
  const [content, setContent] = useState(initialMarkdown);
  const [error, setError] = useState<string | null>(null);
  const { stdout } = useStdout();

  // Handle Escape to cancel
  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleSave = async () => {
    try {
      setError(null);
      const storageFormat = ConfluenceConverter.markdownToStorage(content);
      await onSave(storageFormat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  // Show a simple preview of content (first 5 lines)
  const previewLines = content.split('\n').slice(0, 5);
  const hasMore = content.split('\n').length > 5;

  return (
    <Box flexDirection="column" width="100%">
      {error && <Text color="red">Error: {error}</Text>}

      <Box marginBottom={1}>
        <Text bold color={te.accentAlt}>✏️  Editing: {page.title}</Text>
      </Box>

      {/* Preview of current content */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Text dimColor>Current content preview:</Text>
        {previewLines.map((line, i) => (
          <Text key={i} color="gray">{line || ' '}</Text>
        ))}
        {hasMore && <Text dimColor>... ({content.split('\n').length - 5} more lines)</Text>}
      </Box>

      {/* Input area */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={te.accentAlt}>Edit content (markdown):</Text>
        <Box
          borderStyle="round"
          borderColor={te.accent}
          paddingX={1}
        >
          <TextInput
            value={content}
            onChange={setContent}
            onSubmit={handleSave}
          />
        </Box>
      </Box>

      {saving && <Text color={te.accent}>💾 Saving...</Text>}

      {/* Footer with shortcuts */}
      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: 'Enter', label: 'Save' },
            { key: 'Escape', label: 'Cancel' },
          ]}
        />
      </Box>
      <Box>
        <Text dimColor color={te.accentAlt}>
          💡 Tip: For better editing, use 'e' in viewer to open $EDITOR
        </Text>
      </Box>
    </Box>
  );
}
