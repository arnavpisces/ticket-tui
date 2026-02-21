import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { ConfluencePage } from '../../api/confluence-client.js';
import { ConfluenceConverter } from '../../formatters/confluence-converter.js';
import { mdcatRenderer } from '../../formatters/mdcat-renderer.js';
import { EditableTextBox } from '../common/EditableTextBox.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { openExternalEditor } from '../../utils/external-editor.js';
import { resolveUrl, copyToClipboard, openInBrowser } from '../../utils/links.js';
import { toggleBookmark, isBookmarked } from '../../storage/bookmarks.js';
import { te } from '../../theme/te.js';

export interface PageViewerProps {
  page: ConfluencePage;
  onEdit: () => void;
  onBack: () => void;
  onSave?: (content: string) => Promise<void>;
  isActive?: boolean;
  onOpenComments?: () => void;
  onOpenLabels?: () => void;
  onOpenAttachments?: () => void;
  baseUrl?: string;
}

export function PageViewer({
  page,
  onBack,
  onSave,
  isActive = true,
  onOpenComments,
  onOpenLabels,
  onOpenAttachments,
  baseUrl = '',
}: PageViewerProps) {
  type ViewMode = 'mdcat' | 'edit';
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isExternalEditing, setIsExternalEditing] = useState(false);
  const [ignoreEscapeUntil, setIgnoreEscapeUntil] = useState(0);
  const { stdout } = useStdout();
  const [bookmarked, setBookmarked] = useState(false);

  // Get terminal height for full-screen editor
  const terminalHeight = (stdout?.rows || 24) - 1; // Match App height (rows - 1)
  const terminalWidth = stdout?.columns || 80;
  // Calculate editor height to fit inside App content area without overflow
  // App: Header(1) + TabBar(1) + Footer(1) = 3
  // PageViewer: Title(1) + Separator(1) + Help line(1) + Help margin(1) = 4
  const editorHeight = Math.max(6, terminalHeight - 7);

  // Convert storage format to markdown for editing
  const initialMarkdown = useMemo(() => {
    const storageValue = page?.body?.storage?.value || '';

    if (!storageValue) {
      return '(No content available)';
    }

    const md = ConfluenceConverter.storageToMarkdown(storageValue);

    if (!md || md.trim() === '') {
      return storageValue;
    }

    return md;
  }, [page?.body?.storage?.value]);

  // Editable content state
  const [content, setContent] = useState(initialMarkdown);
  const mdcatAvailable = useMemo(() => mdcatRenderer.isAvailable(), []);
  const mdcatNativeAvailable = useMemo(() => mdcatRenderer.isNativeAvailable(), []);
  const [viewMode, setViewMode] = useState<ViewMode>(mdcatAvailable ? 'mdcat' : 'edit');

  const renderedMdcat = useMemo(() => {
    if (viewMode !== 'mdcat') return '';
    const renderWidth = Math.max(40, terminalWidth - 6);
    return mdcatRenderer.render(content, renderWidth);
  }, [viewMode, content, terminalWidth]);

  useEffect(() => {
    setBookmarked(isBookmarked('confluence', page.id));
  }, [page.id]);

  useEffect(() => {
    setContent(initialMarkdown);
    setHasChanges(false);
    setViewMode(mdcatAvailable ? 'mdcat' : 'edit');
  }, [initialMarkdown, mdcatAvailable]);

  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setHasChanges(newContent !== initialMarkdown);
  }, [initialMarkdown]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!onSave || isSaving) return;

    setIsSaving(true);
    setStatusMessage('Saving...');

    try {
      const storageFormat = ConfluenceConverter.markdownToStorage(content);
      await onSave(storageFormat);
      setStatusMessage('✓ Saved successfully!');
      setHasChanges(false);
    } catch (err) {
      setStatusMessage(`✗ Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }, [onSave, content, isSaving]);

  const handleOpenExternal = useCallback(async () => {
    setIsExternalEditing(true);
    try {
      const result = await openExternalEditor({
        content,
        extension: 'md',
      });
      if (result.success && result.content !== undefined) {
        setContent(result.content);
        setHasChanges(result.content !== initialMarkdown);
      } else if (result.error) {
        setStatusMessage(`✗ ${result.error}`);
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } finally {
      setIsExternalEditing(false);
      // Ignore a trailing ESC immediately after returning from external editor.
      setIgnoreEscapeUntil(Date.now() + 250);
    }
  }, [content, initialMarkdown]);

  const handleRequestWritable = useCallback(() => {
    if (viewMode !== 'edit') {
      setViewMode('edit');
      setStatusMessage('Switched to edit mode');
      setTimeout(() => setStatusMessage(null), 1200);
    }
  }, [viewMode]);

  // Handle Escape to go back
  useInput((input, key) => {
    if (Date.now() < ignoreEscapeUntil) {
      return;
    }
    if (key.escape) {
      onBack();
      return;
    }
    if (key.ctrl && input === 'o') {
      const url = resolveUrl(baseUrl, page._links?.webui || '');
      openInBrowser(url);
      return;
    }
    if (key.ctrl && input === 'y') {
      const url = resolveUrl(baseUrl, page._links?.webui || '');
      copyToClipboard(url).then((ok) => {
        setStatusMessage(ok ? '✓ Link copied' : '✗ Copy failed');
        setTimeout(() => setStatusMessage(null), 2000);
      });
      return;
    }
    if (key.ctrl && input === 'b') {
      const url = resolveUrl(baseUrl, page._links?.webui || '');
      const now = toggleBookmark('confluence', page.id, page.title, url);
      setBookmarked(now);
      setStatusMessage(now ? '★ Bookmarked' : '☆ Bookmark removed');
      setTimeout(() => setStatusMessage(null), 2000);
      return;
    }
    if (key.ctrl && input === 'm') {
      onOpenComments?.();
      return;
    }
    if (key.ctrl && input === 'l') {
      onOpenLabels?.();
      return;
    }
    if (key.ctrl && input === 'a') {
      onOpenAttachments?.();
      return;
    }
    if (key.ctrl && input === 't') {
      setViewMode(prev => (prev === 'mdcat' ? 'edit' : 'mdcat'));
      return;
    }
  }, { isActive: isActive && !isExternalEditing });

  return (
    <Box flexDirection="column" width="100%">
      {/* Page Title - simple inline */}
      <Box width="100%">
        <Text bold color={te.accentAlt} wrap="truncate">
          {`📄 ${page.title}${bookmarked ? ' ★' : ''}${hasChanges ? ' (unsaved)' : ''}${statusMessage ? ` | ${statusMessage}` : ''}`}
        </Text>
      </Box>

      {/* Separator line */}
      <Text dimColor wrap="truncate">{'─'.repeat(Math.max(1, terminalWidth))}</Text>

      {/* Editable Content - Full screen */}
      {/* screenTop calculation: Header(1) + TabBar(1) + Title(1) + Separator(1) = 4 rows above */}
      <EditableTextBox
        content={viewMode === 'mdcat' ? renderedMdcat : content}
        onChange={viewMode === 'edit' ? handleContentChange : () => {}}
        onSave={handleSave}
        height={editorHeight}
        borderColor={viewMode === 'mdcat' ? te.accent : (hasChanges ? te.warning : te.muted)}
        isActive={isActive && !isSaving && !isExternalEditing}
        screenTop={4}
        screenLeft={0}
        syntaxHighlight={viewMode === 'edit' || (viewMode === 'mdcat' && !mdcatNativeAvailable)}
        readOnly={viewMode === 'mdcat'}
        onOpenExternalEditor={handleOpenExternal}
        onRequestWritable={handleRequestWritable}
      />

      <Box marginTop={1}>
        <Text dimColor wrap="truncate">
          Mode: {viewMode.toUpperCase()}
          {viewMode === 'mdcat' ? (mdcatNativeAvailable ? ' (native)' : ' (built-in)') : ''}
          {bookmarked ? ' | ★ Bookmarked' : ''}
        </Text>
      </Box>
      <ShortcutHints
        hints={[
          { key: 'Ctrl+T', label: 'Toggle View' },
          { key: 'Ctrl+S', label: 'Save' },
          { key: 'Ctrl+E', label: '$EDITOR' },
          { key: 'Ctrl+M', label: 'Comments' },
          { key: 'Ctrl+L', label: 'Labels' },
          { key: 'Ctrl+A', label: 'Attachments' },
          { key: 'Ctrl+O', label: 'Open' },
          { key: 'Ctrl+Y', label: 'Copy' },
          { key: 'Ctrl+B', label: 'Bookmark' },
          { key: 'Escape', label: 'Back' },
        ]}
      />
    </Box>
  );
}
