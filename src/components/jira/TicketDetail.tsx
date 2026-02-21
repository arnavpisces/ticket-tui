import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { JiraIssue, JiraTransition, JiraAttachment, JiraPriority } from '../../api/jira-client.js';
import { AdfConverter } from '../../formatters/adf-converter.js';
import { SelectableItem } from '../common/SelectableItem.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { openExternalEditor } from '../../utils/external-editor.js';
import { buildJiraIssueUrl, copyToClipboard, openInBrowser } from '../../utils/links.js';
import { getDownloadsDir, normalizeDraggedPath } from '../../utils/paths.js';
import { toggleBookmark, isBookmarked } from '../../storage/bookmarks.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { highlightMarkdownLine, detectCodeBlock, highlightCodeLine } from '../../utils/markdown-highlighter.js';
import { getJiraStatusColor, getJiraTypeColor, getJiraPriorityColor } from '../../utils/jira-colors.js';
import { te } from '../../theme/te.js';

type DetailMode =
  | 'view'
  | 'edit-title'
  | 'edit-description'
  | 'add-comment'
  | 'edit-comment'
  | 'comments'
  | 'attachments'
  | 'upload-attachment'
  | 'select-status'
  | 'select-priority'
  | 'select-comment';

export interface TicketDetailProps {
  issue: JiraIssue;
  baseUrl: string;
  currentAccountId?: string;
  transitions?: JiraTransition[];
  priorities?: JiraPriority[];
  onSaveTitle?: (title: string) => Promise<void>;
  onSaveDescription?: (description: string) => Promise<void>;
  onSavePriority?: (priorityId: string) => Promise<void>;
  onAssignToMe?: () => Promise<void>;
  onAddComment?: (comment: string) => Promise<void>;
  onUpdateComment?: (commentId: string, comment: string) => Promise<void>;
  onTransition?: (transitionId: string) => Promise<void>;
  onFetchComments?: () => Promise<any[]>;
  onDownloadAttachment?: (attachmentId: string, filename: string) => Promise<{ data: Buffer; filename: string }>;
  onUploadAttachment?: (filePath: string) => Promise<void>;
  onBookmarkChanged?: () => void;
  onRefresh?: () => Promise<void> | void;
  onBack?: () => void;
}

export function TicketDetail({
  issue,
  baseUrl,
  currentAccountId,
  transitions = [],
  priorities = [],
  onSaveTitle,
  onSaveDescription,
  onSavePriority,
  onAssignToMe,
  onAddComment,
  onUpdateComment,
  onTransition,
  onFetchComments,
  onDownloadAttachment,
  onUploadAttachment,
  onBookmarkChanged,
  onRefresh,
  onBack
}: TicketDetailProps) {
  const { stdout } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<DetailMode>('view');
  const [editValue, setEditValue] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [selectedCommentIndex, setSelectedCommentIndex] = useState(0);
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState(0);
  const [selectedPriorityIndex, setSelectedPriorityIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [allComments, setAllComments] = useState<any[]>([]);
  const [attachmentsMessage, setAttachmentsMessage] = useState<string | null>(null);
  const [uploadPath, setUploadPath] = useState('');

  const description = AdfConverter.adfToMarkdown(issue.fields.description);
  const parentIssue = issue.fields.parent;
  const parentKey = parentIssue?.key || '';
  const parentSummary = parentIssue?.fields?.summary || '';
  const currentAssignee = issue.fields.assignee?.displayName || 'Unassigned';
  const currentAssigneeAccountId = issue.fields.assignee?.accountId as string | undefined;
  const assigneeIsMe = Boolean(currentAccountId && currentAssigneeAccountId === currentAccountId);
  const comments = issue.fields.comment?.comments || [];
  const attachments = issue.fields.attachment || [];
  const terminalRows = stdout?.rows || 24;
  const compactViewport = terminalRows <= 32;
  const previewWidth = Math.max(20, (stdout?.columns || 80) - 10);
  const descriptionPreviewLines = compactViewport ? 3 : 5;

  const renderMarkdownPreview = (markdown: string, maxLines: number) => {
    const lines = markdown.split('\n');
    return lines.slice(0, maxLines).map((line, i) => {
      const displayLine =
        line.length > previewWidth ? `${line.slice(0, Math.max(0, previewWidth - 3))}...` : line;
      const codeBlockLang = detectCodeBlock(lines, i);
      const content =
        codeBlockLang && !displayLine.startsWith('```')
          ? highlightCodeLine(displayLine || ' ', codeBlockLang)
          : highlightMarkdownLine(displayLine || ' ', i);

      return (
        <Box key={`${i}-${displayLine}`} height={1}>
          {content}
        </Box>
      );
    });
  };

  // Get user's own comments that can be edited
  const myComments = comments.filter((c: any) =>
    currentAccountId && c.author?.accountId === currentAccountId
  );

  // Selectable items in view mode.
  const selectableItems = ['status', 'assignee', 'priority', 'title', 'description', 'comments', 'attachments', 'add-comment'];
  if (myComments.length > 0) {
    selectableItems.push('edit-comment');
  }
  const selectableCount = selectableItems.length;
  const indexOfItem = (item: string) => selectableItems.indexOf(item);
  const isSelectedItem = (item: string) => selectedIndex === indexOfItem(item);

  // Clear copy message after 2 seconds
  useEffect(() => {
    if (copyMessage) {
      const timer = setTimeout(() => setCopyMessage(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copyMessage]);

  useEffect(() => {
    setBookmarked(isBookmarked('jira', issue.key));
  }, [issue.key]);

  useEffect(() => {
    setAllComments(comments);
  }, [issue.key, comments.length]);

  useEffect(() => {
    if (mode === 'comments' && onFetchComments) {
      setCommentsLoading(true);
      onFetchComments()
        .then((data: any[]) => setAllComments(data || []))
        .catch(() => setAllComments([]))
        .finally(() => setCommentsLoading(false));
    }
  }, [mode, onFetchComments]);

  // Handle keyboard input
  useInput((input, key) => {
    // External editor for long-form fields
    if ((key.ctrl && input === 'e') && (mode === 'edit-description' || mode === 'add-comment' || mode === 'edit-comment')) {
      (async () => {
        setSaving(true);
        const result = await openExternalEditor({
          content: editValue,
          extension: 'md',
        });
        setSaving(false);
        if (result.success && result.content !== undefined) {
          setEditValue(result.content);
        } else if (result.error) {
          setError(result.error);
        }
      })();
      return;
    }

    if (key.ctrl && input === 'o') {
      openInBrowser(buildJiraIssueUrl(baseUrl, issue.key));
      return;
    }
    if (key.ctrl && input === 'y') {
      handleCopyUrl();
      return;
    }
    if (key.ctrl && input === 'b') {
      const now = toggleBookmark(
        'jira',
        issue.key,
        `${issue.key}: ${issue.fields.summary}`,
        buildJiraIssueUrl(baseUrl, issue.key),
        { status: issue.fields.status?.name }
      );
      setBookmarked(now);
      onBookmarkChanged?.();
      setCopyMessage(now ? '★ Bookmarked' : '☆ Bookmark removed');
      return;
    }

    // Global Escape Handler
    if (key.escape) {
      if (mode !== 'view') {
        handleCancel();
      } else if (onBack) {
        onBack();
      }
      return;
    }

    // Comment selection mode
    if (mode === 'select-comment') {
      if (key.upArrow) {
        setSelectedCommentIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedCommentIndex(prev => Math.min(myComments.length - 1, prev + 1));
      } else if (key.return && myComments.length > 0) {
        const comment = myComments[selectedCommentIndex];
        setEditingCommentId(comment.id);
        setEditValue(AdfConverter.adfToMarkdown(comment.body));
        setMode('edit-comment');
      }
      return;
    }

    // Comments view
    if (mode === 'comments') {
      if (key.upArrow && allComments.length > 0) {
        setSelectedCommentIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow && allComments.length > 0) {
        setSelectedCommentIndex(prev => Math.min(allComments.length - 1, prev + 1));
      } else if (key.return && allComments.length > 0) {
        const comment = allComments[selectedCommentIndex];
        const isMine = currentAccountId && comment?.author?.accountId === currentAccountId;
        if (comment?.id && isMine) {
          setEditingCommentId(comment.id);
          setEditValue(AdfConverter.adfToMarkdown(comment.body));
          setMode('edit-comment');
        } else if (comment?.id) {
          setError('You can only edit your own comments.');
        }
      } else if (input === 'a') {
        setEditValue('');
        setMode('add-comment');
      }
      return;
    }

    // Attachments view
    if (mode === 'attachments') {
      if (key.upArrow && attachments.length > 0) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow && attachments.length > 0) {
        setSelectedIndex((prev) => Math.min(attachments.length - 1, prev + 1));
      } else if (input === 'u') {
        setUploadPath('');
        setMode('upload-attachment');
      } else if (input === 'd' && attachments[selectedIndex]) {
        handleDownloadAttachment(attachments[selectedIndex]);
      }
      return;
    }

    if (mode === 'upload-attachment') {
      return;
    }

    // Status selection mode
    if (mode === 'select-status') {
      if (key.upArrow) {
        setSelectedTransitionIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedTransitionIndex(prev => Math.min(transitions.length - 1, prev + 1));
      } else if (key.return && transitions.length > 0) {
        handleTransition();
      }
      return;
    }

    // Priority selection mode
    if (mode === 'select-priority') {
      if (key.upArrow) {
        setSelectedPriorityIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedPriorityIndex(prev => Math.min(priorities.length - 1, prev + 1));
      } else if (key.return && priorities.length > 0) {
        handlePriorityUpdate();
      }
      return;
    }

    // Don't handle other input when editing (TextInput is active)
    if (mode !== 'view') return;

    // Copy shortcuts
    if (key.ctrl && input === 'u') {
      handleCopyKey();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev - 1 + selectableCount) % selectableCount);
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev + 1) % selectableCount);
    } else if (key.return) {
      handleSelect();
    }
  });

  const handleCopyUrl = async () => {
    try {
      // Remove trailing slash from baseUrl to prevent double slashes
      const url = buildJiraIssueUrl(baseUrl, issue.key);
      await copyToClipboard(url);
      setCopyMessage('✓ URL copied!');
    } catch {
      setCopyMessage('✗ Copy failed');
    }
  };

  const handleCopyKey = async () => {
    try {
      await copyToClipboard(issue.key);
      setCopyMessage('✓ Key copied!');
    } catch {
      setCopyMessage('✗ Copy failed');
    }
  };

  const handleSelect = () => {
    setError(null);
    const item = selectableItems[selectedIndex];

    switch (item) {
      case 'status':
        if (transitions.length > 0) {
          setSelectedTransitionIndex(0);
          setMode('select-status');
        }
        break;
      case 'priority':
        if (priorities.length > 0) {
          const currentPriorityId = String(issue.fields.priority?.id || '');
          const idx = priorities.findIndex((p) => p.id === currentPriorityId);
          setSelectedPriorityIndex(idx >= 0 ? idx : 0);
          setMode('select-priority');
        } else {
          setError('No priorities available for this Jira project.');
        }
        break;
      case 'assignee':
        void handleAssignToMe();
        break;
      case 'title':
        setEditValue(issue.fields.summary);
        setMode('edit-title');
        break;
      case 'description':
        setEditValue(description.slice(0, 500));
        setMode('edit-description');
        break;
      case 'comments':
        setSelectedCommentIndex(0);
        setMode('comments');
        break;
      case 'attachments':
        setSelectedIndex(0);
        setMode('attachments');
        break;
      case 'add-comment':
        setEditValue('');
        setMode('add-comment');
        break;
      case 'edit-comment':
        if (myComments.length > 0) {
          setSelectedCommentIndex(myComments.length - 1);
          setMode('select-comment');
        }
        break;
    }
  };

  const handleTransition = async () => {
    if (saving || transitions.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      if (onTransition) {
        await onTransition(transitions[selectedTransitionIndex].id);
      }
      if (onRefresh) await onRefresh();
      setMode('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status change failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePriorityUpdate = async () => {
    if (saving || priorities.length === 0 || !onSavePriority) return;
    setSaving(true);
    setError(null);

    try {
      const selected = priorities[selectedPriorityIndex];
      if (!selected) return;
      await onSavePriority(selected.id);
      if (onRefresh) await onRefresh();
      setMode('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Priority update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignToMe = async () => {
    if (saving || !onAssignToMe) return;
    if (assigneeIsMe) {
      setCopyMessage('✓ Already assigned to you');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onAssignToMe();
      if (onRefresh) await onRefresh();
      setCopyMessage('✓ Assigned to you');
      setMode('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign ticket');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      switch (mode) {
        case 'edit-title':
          if (onSaveTitle) {
            await onSaveTitle(editValue);
          }
          break;
        case 'edit-description':
          if (onSaveDescription) {
            await onSaveDescription(editValue);
          }
          break;
        case 'add-comment':
          if (editValue.trim() && onAddComment) {
            await onAddComment(editValue);
          }
          break;
        case 'edit-comment':
          if (editValue.trim() && onUpdateComment && editingCommentId) {
            await onUpdateComment(editingCommentId, editValue);
          }
          break;
      }
      if (onRefresh) await onRefresh();
      setMode('view');
      setEditingCommentId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setMode('view');
    setEditValue('');
    setEditingCommentId(null);
    setError(null);
    setSelectedIndex(0);
  };

  const handleDownloadAttachment = async (attachment: JiraAttachment) => {
    if (!onDownloadAttachment) return;
    setAttachmentsMessage('Downloading...');
    try {
      const { data, filename } = await onDownloadAttachment(attachment.id, attachment.filename);
      const dest = join(getDownloadsDir(), filename || attachment.filename);
      writeFileSync(dest, data);
      setAttachmentsMessage(`✓ Saved to ${dest}`);
    } catch (err) {
      setAttachmentsMessage(`✗ Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setTimeout(() => setAttachmentsMessage(null), 3000);
  };

  // Render status selection mode
  if (mode === 'select-status') {
    return (
      <Box flexDirection="column" width="100%">
        {error && <Text color="red">Error: {error}</Text>}

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={te.accent}
          paddingX={1}
          marginY={1}
        >
          <Text bold color={te.accentAlt}>
            📋 Change Status (Current: {issue.fields.status.name})
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {transitions.map((t, i) => (
              <Text
                key={t.id}
                color={i === selectedTransitionIndex ? te.accentAlt : te.fg}
                bold={i === selectedTransitionIndex}
              >
                {i === selectedTransitionIndex ? '▶ ' : '  '}
                {t.name} → {t.to.name}
              </Text>
            ))}
          </Box>
        </Box>

        {saving && <Text dimColor>Updating status...</Text>}

        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: '↑/↓', label: 'Navigate' },
              { key: 'Enter', label: 'Apply' },
              { key: 'Escape', label: 'Cancel' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Render comment selection mode
  if (mode === 'select-comment') {
    return (
      <Box flexDirection="column" width="100%">
        {error && <Text color="red">Error: {error}</Text>}

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={te.accent}
          paddingX={1}
          marginY={1}
        >
          <Text bold color={te.accentAlt}>Select Comment to Edit:</Text>
          <Box flexDirection="column" marginTop={1}>
            {myComments.map((c: any, i: number) => (
              <Box key={c.id || i} flexDirection="column" marginBottom={1}>
                <Text color={i === selectedCommentIndex ? te.accentAlt : te.fg}>
                  {i === selectedCommentIndex ? '▶ ' : '  '}
                  {c.created.split('T')[0]} - {AdfConverter.adfToMarkdown(c.body).slice(0, 50)}...
                </Text>
              </Box>
            ))}
          </Box>
        </Box>

        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: '↑/↓', label: 'Navigate' },
              { key: 'Enter', label: 'Select' },
              { key: 'Escape', label: 'Cancel' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  if (mode === 'select-priority') {
    return (
      <Box flexDirection="column" width="100%">
        {error && <Text color="red">Error: {error}</Text>}

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={te.accent}
          paddingX={1}
          marginY={1}
        >
          <Text bold color={te.accentAlt}>
            ⚑ Change Priority (Current: {issue.fields.priority?.name || 'None'})
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {priorities.length === 0 && (
              <Text dimColor>No priorities available.</Text>
            )}
            {priorities.map((p, i) => (
              <Text
                key={p.id}
                color={i === selectedPriorityIndex ? te.accentAlt : getJiraPriorityColor(p.name)}
                bold={i === selectedPriorityIndex}
              >
                {i === selectedPriorityIndex ? '▶ ' : '  '}
                {p.name}
              </Text>
            ))}
          </Box>
        </Box>

        {saving && <Text dimColor>Updating priority...</Text>}

        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: '↑/↓', label: 'Navigate' },
              { key: 'Enter', label: 'Apply' },
              { key: 'Escape', label: 'Cancel' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  if (mode === 'comments') {
    const selected = allComments[selectedCommentIndex];
    return (
      <Box flexDirection="column" width="100%">
        <Text bold color={te.accentAlt}>Comments ({allComments.length})</Text>
        {commentsLoading && <Text dimColor>Loading comments...</Text>}
        {error && <Text color="red">Error: {error}</Text>}

        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
          {allComments.length === 0 && !commentsLoading && (
            <Text dimColor>No comments yet.</Text>
          )}
          {allComments.map((c: any, i: number) => (
            <Text
              key={c.id || i}
              color={i === selectedCommentIndex ? te.accentAlt : te.fg}
              bold={i === selectedCommentIndex}
            >
              {i === selectedCommentIndex ? '▶ ' : '  '}
              {c.author?.displayName || 'Unknown'} · {c.created?.split('T')[0] || ''}
            </Text>
          ))}
        </Box>

        {selected && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Selected:</Text>
            <Box flexDirection="column">
              {renderMarkdownPreview(AdfConverter.adfToMarkdown(selected.body), 12)}
            </Box>
          </Box>
        )}

        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: '↑/↓', label: 'Navigate' },
              { key: 'Enter', label: 'Edit' },
              { key: 'a', label: 'Add' },
              { key: 'Escape', label: 'Back' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  if (mode === 'attachments') {
    return (
      <Box flexDirection="column" width="100%">
        <Text bold color={te.accentAlt}>Attachments ({attachments.length})</Text>
        {attachmentsMessage && <Text dimColor>{attachmentsMessage}</Text>}

        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
          {attachments.length === 0 && (
            <Text dimColor>No attachments</Text>
          )}
          {attachments.map((att, i) => (
            <Text
              key={att.id}
              color={i === selectedIndex ? te.accentAlt : te.fg}
              bold={i === selectedIndex}
            >
              {i === selectedIndex ? '▶ ' : '  '}
              {att.filename} ({Math.round((att.size || 0) / 1024)} KB)
            </Text>
          ))}
        </Box>

        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: '↑/↓', label: 'Navigate' },
              { key: 'd', label: 'Download' },
              { key: 'u', label: 'Upload' },
              { key: 'Escape', label: 'Back' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  if (mode === 'upload-attachment') {
    return (
      <Box flexDirection="column" width="100%">
        <Text bold color={te.accentAlt}>Upload Attachment</Text>
        <Box marginTop={1} borderStyle="round" borderColor={te.accent} paddingX={1}>
          <TextInput
            value={uploadPath}
            onChange={setUploadPath}
            onSubmit={async () => {
              if (!uploadPath.trim() || !onUploadAttachment) return;
              setSaving(true);
              try {
                const normalized = normalizeDraggedPath(uploadPath);
                await onUploadAttachment(normalized);
                setAttachmentsMessage('✓ Upload complete');
                onRefresh?.();
                setMode('attachments');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Upload failed');
                setMode('attachments');
              } finally {
                setSaving(false);
              }
            }}
            placeholder="Drag & drop file path here..."
          />
        </Box>
        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: 'Enter', label: 'Upload' },
              { key: 'Escape', label: 'Cancel' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Render edit mode
  if (mode !== 'view') {
    const modeLabels: Record<string, string> = {
      'edit-title': 'Edit Title',
      'edit-description': 'Edit Description',
      'add-comment': 'Add Comment',
      'edit-comment': 'Edit Comment',
    };

    return (
      <Box flexDirection="column" width="100%">
        {error && <Text color="red">Error: {error}</Text>}

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={te.accent}
          paddingX={1}
          marginY={1}
        >
          <Text bold color={te.accentAlt}>
            ✎ {modeLabels[mode]}
          </Text>
          <Box marginTop={1}>
            <TextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={handleSave}
            />
          </Box>
        </Box>

        {saving && <Text dimColor>Saving...</Text>}

        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: 'Enter', label: 'Save' },
              { key: 'Ctrl+E', label: '$EDITOR' },
              { key: 'Escape', label: 'Cancel' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // Render view mode with selectable items
  return (
    <Box flexDirection="column" width="100%">
      {error && <Text color="red">Error: {error}</Text>}
      {copyMessage && <Text color="green">{copyMessage}</Text>}

      {/* Key (non-selectable header) */}
      <Box>
        <Text bold color="white">{issue.key}</Text>
        <Text color={getJiraStatusColor(issue.fields.status?.name)}>  {issue.fields.status?.name}</Text>
        {issue.fields.issuetype?.name && (
          <Text color={getJiraTypeColor(issue.fields.issuetype.name)}> · {issue.fields.issuetype.name}</Text>
        )}
        {issue.fields.priority?.name && (
          <Text color={getJiraPriorityColor(issue.fields.priority.name)}> · {issue.fields.priority.name}</Text>
        )}
      </Box>

      {/* Selectable: Status */}
      {parentKey && (
        <SelectableItem
          label="PARENT TICKET"
          content={
            <Box>
              <Text color={te.accentAlt}>{parentKey}</Text>
              {parentSummary ? <Text color={te.fg}> {' - '}{parentSummary}</Text> : null}
            </Box>
          }
          isSelected={false}
          actionLabel="[LINKED]"
          compact
        />
      )}

      {/* Selectable: Status */}
      <SelectableItem
        label="STATUS"
        content={<Text color={getJiraStatusColor(issue.fields.status?.name)}>{issue.fields.status.name}</Text>}
        isSelected={isSelectedItem('status')}
        actionLabel={transitions.length > 0 ? "[CHANGE]" : "[VIEW]"}
        compact
      />

      {/* Selectable: Assignee */}
      <SelectableItem
        label="ASSIGNEE"
        content={<Text color={assigneeIsMe ? te.success : te.fg}>{currentAssignee}{assigneeIsMe ? ' (you)' : ''}</Text>}
        isSelected={isSelectedItem('assignee')}
        actionLabel={assigneeIsMe ? "[YOU]" : "[ASSIGN]"}
        compact
      />

      {/* Selectable: Priority */}
      <SelectableItem
        label="PRIORITY"
        content={<Text color={getJiraPriorityColor(issue.fields.priority?.name)}>{issue.fields.priority?.name || 'None'}</Text>}
        isSelected={isSelectedItem('priority')}
        actionLabel={priorities.length > 0 ? "[CHANGE]" : "[VIEW]"}
        compact
      />

      {/* Selectable: Title */}
      <SelectableItem
        label="TITLE"
        content={<Text color="white">{issue.fields.summary}</Text>}
        isSelected={isSelectedItem('title')}
        actionLabel="[EDIT]"
      />

      {/* Selectable: Description */}
      <SelectableItem
        label="DESCRIPTION"
        content={
          <Box flexDirection="column">
            {renderMarkdownPreview(
              description,
              isSelectedItem('description') ? descriptionPreviewLines : 1
            )}
            {isSelectedItem('description') && description.split('\n').length > descriptionPreviewLines && (
              <Text dimColor>... ({description.split('\n').length - descriptionPreviewLines} more lines)</Text>
            )}
          </Box>
        }
        isSelected={isSelectedItem('description')}
        actionLabel="[EDIT]"
      />

      {/* Selectable: Comments */}
      <SelectableItem
        label="COMMENTS"
        content={`${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
        isSelected={isSelectedItem('comments')}
        actionLabel="[VIEW]"
        compact
      />

      {/* Selectable: Attachments */}
      <SelectableItem
        label="ATTACHMENTS"
        content={`${attachments.length} attachment${attachments.length !== 1 ? 's' : ''}`}
        isSelected={isSelectedItem('attachments')}
        actionLabel="[VIEW]"
        compact
      />

      {/* Selectable: Add Comment */}
      <SelectableItem
        label="ADD COMMENT"
        isSelected={isSelectedItem('add-comment')}
        actionLabel="[ENTER]"
        compact
      />

      {/* Selectable: Edit Comment (if user has comments) */}
      {myComments.length > 0 && (
        <SelectableItem
          label="EDIT MY COMMENT"
          content={`(${myComments.length} comment${myComments.length > 1 ? 's' : ''})`}
          isSelected={isSelectedItem('edit-comment')}
          actionLabel="[EDIT]"
          compact
        />
      )}

      {/* Navigation hint */}
      <Box marginTop={1}>
        <ShortcutHints
          hints={[
            { key: '↑/↓', label: 'Navigate' },
            { key: 'Enter', label: 'Select' },
            { key: 'Ctrl+O', label: 'Open' },
            { key: 'Ctrl+Y', label: 'Copy URL' },
            { key: 'Ctrl+B', label: 'Toggle Bookmark' },
          ]}
        />
      </Box>
      <Box>
        <ShortcutHints
          hints={[
            { key: 'Ctrl+R', label: 'Refresh' },
            { key: 'Ctrl+U', label: 'Copy Key' },
            { key: 'Escape', label: 'Back' },
          ]}
        />
      </Box>
    </Box>
  );
}
