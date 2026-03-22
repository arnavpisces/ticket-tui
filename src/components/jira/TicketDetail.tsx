import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from '../common/WordTextInput.js';
import {
  JiraIssue,
  JiraTransition,
  JiraAttachment,
  JiraPriority,
  JiraTransitionField,
} from '../../api/jira-client.js';
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
  | 'transition-fields'
  | 'select-priority'
  | 'select-comment';

interface TransitionRequiredFieldState {
  id: string;
  name: string;
  definition: JiraTransitionField;
}

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
  onTransition?: (transitionId: string, fields?: Record<string, any>) => Promise<void>;
  onRefreshTransitions?: () => Promise<void>;
  onSearchUsers?: (query: string) => Promise<Array<{ accountId: string; displayName: string; emailAddress?: string }>>;
  onResolveTransitionFields?: (
    transitionId: string,
    requiredFieldNames?: string[]
  ) => Promise<Record<string, JiraTransitionField>>;
  onFetchComments?: () => Promise<any[]>;
  onDownloadAttachment?: (attachmentId: string, filename: string) => Promise<{ data: Buffer; filename: string }>;
  onUploadAttachment?: (filePath: string) => Promise<void>;
  onBookmarkChanged?: () => void;
  onCreateChildTicket?: () => void;
  onRefresh?: () => Promise<void> | void;
  onBack?: () => void;
}

function getRequiredTransitionFields(transition: JiraTransition | undefined): TransitionRequiredFieldState[] {
  if (!transition?.fields) return [];

  return Object.entries(transition.fields)
    .filter(([, definition]) => {
      if (!definition?.required) return false;
      const operations = Array.isArray(definition.operations) ? definition.operations : [];
      const canSet = operations.length === 0 || operations.includes('set');
      return canSet;
    })
    .map(([fieldId, definition]) => ({
      id: fieldId,
      name: definition.name || fieldId,
      definition,
    }));
}

function buildFieldValueFromAllowed(fieldId: string, rawValue: Record<string, any>): any {
  if (!rawValue || typeof rawValue !== 'object') {
    return rawValue;
  }

  const schemaType = String(rawValue?.schema?.type || '').toLowerCase();
  if (schemaType === 'user' && rawValue.accountId) {
    return { accountId: rawValue.accountId };
  }
  if (rawValue.id !== undefined && rawValue.id !== null && rawValue.id !== '') {
    return { id: String(rawValue.id) };
  }
  if (rawValue.value !== undefined) {
    return { value: rawValue.value };
  }
  if (rawValue.name !== undefined) {
    return { name: rawValue.name };
  }
  if (rawValue.key !== undefined) {
    return { key: rawValue.key };
  }
  // Fallback to full object for custom transitions expecting richer payloads.
  return rawValue;
}

function formatAllowedValueLabel(rawValue: Record<string, any>): string {
  if (!rawValue || typeof rawValue !== 'object') {
    return String(rawValue ?? '');
  }

  if (typeof rawValue.displayName === 'string' && rawValue.displayName.trim()) {
    return rawValue.displayName;
  }
  if (typeof rawValue.name === 'string' && rawValue.name.trim()) {
    return rawValue.name;
  }
  if (typeof rawValue.value === 'string' && rawValue.value.trim()) {
    return rawValue.value;
  }
  if (typeof rawValue.key === 'string' && rawValue.key.trim()) {
    return rawValue.key;
  }
  if (rawValue.id !== undefined && rawValue.id !== null) {
    return String(rawValue.id);
  }

  return JSON.stringify(rawValue);
}

function buildFieldValueFromText(fieldId: string, definition: JiraTransitionField, rawInput: string): any {
  const input = rawInput.trim();
  const schemaType = String(definition?.schema?.type || '').toLowerCase();
  const schemaSystem = String(definition?.schema?.system || '').toLowerCase();
  const schemaCustom = String(definition?.schema?.custom || '').toLowerCase();
  const requiresAdf =
    schemaType === 'doc' ||
    schemaType === 'textarea' ||
    schemaSystem === 'description' ||
    schemaCustom.includes(':textarea') ||
    schemaCustom.includes('richtext');

  const asAdfDoc = (text: string) => ({
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text,
          },
        ],
      },
    ],
  });

  if (schemaType === 'number') {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : input;
  }

  if (schemaType === 'user') {
    return { accountId: input };
  }

  if (
    schemaType === 'option' ||
    schemaType === 'priority' ||
    schemaType === 'resolution' ||
    schemaType === 'version' ||
    schemaType === 'component' ||
    schemaSystem === 'resolution' ||
    schemaSystem === 'priority'
  ) {
    return /^\d+$/.test(input) ? { id: input } : { name: input };
  }

  if (schemaType === 'array') {
    const values = input
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const itemType = String(definition?.schema?.items || '').toLowerCase();
    if (itemType === 'number') {
      return values.map((v) => {
        const parsed = Number(v);
        return Number.isFinite(parsed) ? parsed : v;
      });
    }
    if (itemType === 'option' || itemType === 'version' || itemType === 'component') {
      return values.map((v) => (/^\d+$/.test(v) ? { id: v } : { name: v }));
    }
    if (itemType === 'user') {
      return values.map((v) => ({ accountId: v }));
    }
    return values;
  }

  if (requiresAdf) {
    return asAdfDoc(input);
  }

  // URL and string-like custom fields use raw string.
  if (schemaType === 'string' || schemaCustom.includes('url')) {
    return input;
  }

  return input;
}

function getTransitionFieldInputHint(definition: JiraTransitionField): string {
  const schemaType = String(definition?.schema?.type || '').toLowerCase();
  const schemaCustom = String(definition?.schema?.custom || '').toLowerCase();

  if ((definition.allowedValues || []).length > 0) {
    return 'Pick a value with ↑/↓ and press Enter.';
  }
  if (schemaCustom.includes('url')) {
    return 'Enter a full URL (for example https://example.com/doc).';
  }
  if (schemaType === 'number') {
    return 'Enter a numeric value.';
  }
  if (schemaType === 'array') {
    return 'Enter comma-separated values.';
  }
  if (schemaType === 'user') {
    return 'Type a Jira user name and select from suggestions (or enter accountId).';
  }
  return 'Enter a value and press Enter.';
}

function normalizeFieldToken(value: string): string {
  return value.trim().toLowerCase();
}

function extractRequiredFieldNamesFromError(errorMessage: string): string[] {
  const names = new Set<string>();
  const trimmed = errorMessage.trim();
  const payloadStart = trimmed.indexOf('{');
  const payload = payloadStart >= 0 ? trimmed.slice(payloadStart) : '';
  let errorMessages: string[] = [];
  let errorEntries: Array<[string, string]> = [];

  if (payload) {
    try {
      const parsed = JSON.parse(payload) as {
        errorMessages?: string[];
        errors?: Record<string, string>;
      };
      if (Array.isArray(parsed.errorMessages)) {
        errorMessages = parsed.errorMessages.filter((entry): entry is string => typeof entry === 'string');
      }
      if (parsed.errors && typeof parsed.errors === 'object') {
        errorEntries = Object.entries(parsed.errors).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        );
      }
    } catch {
      // Ignore parse issues and fallback to regex scanning on plain text.
    }
  }

  const combinedMessages = [...errorMessages];
  if (combinedMessages.length === 0) {
    combinedMessages.push(trimmed);
  }

  for (const message of combinedMessages) {
    const match = message.match(/field\s+(.+?)\s+is required/i);
    if (match && match[1]) {
      names.add(match[1].trim());
    }
  }

  for (const [fieldKey, message] of errorEntries) {
    if (/required/i.test(message)) {
      names.add(fieldKey);
    }
  }

  return [...names];
}

function buildQueueForNamedRequiredFields(
  fields: Record<string, JiraTransitionField>,
  requiredNames: string[]
): TransitionRequiredFieldState[] {
  const wanted = new Set(requiredNames.map(normalizeFieldToken));
  const queue: TransitionRequiredFieldState[] = [];

  for (const [fieldId, definition] of Object.entries(fields || {})) {
    const nameToken = normalizeFieldToken(definition?.name || '');
    const idToken = normalizeFieldToken(fieldId);
    if (!wanted.has(nameToken) && !wanted.has(idToken)) continue;
    queue.push({
      id: fieldId,
      name: definition.name || fieldId,
      definition,
    });
  }

  return queue;
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
  onRefreshTransitions,
  onSearchUsers,
  onResolveTransitionFields,
  onFetchComments,
  onDownloadAttachment,
  onUploadAttachment,
  onBookmarkChanged,
  onCreateChildTicket,
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
  const [transitionFieldsQueue, setTransitionFieldsQueue] = useState<TransitionRequiredFieldState[]>([]);
  const [transitionFieldCursor, setTransitionFieldCursor] = useState(0);
  const [transitionFieldValues, setTransitionFieldValues] = useState<Record<string, any>>({});
  const [transitionFieldInput, setTransitionFieldInput] = useState('');
  const [transitionAllowedIndex, setTransitionAllowedIndex] = useState(0);
  const [transitionUserOptions, setTransitionUserOptions] = useState<Array<{ accountId: string; displayName: string; emailAddress?: string }>>([]);
  const [transitionUserIndex, setTransitionUserIndex] = useState(0);
  const [transitionUserLoading, setTransitionUserLoading] = useState(false);
  const [pendingTransitionId, setPendingTransitionId] = useState<string | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [selectedPriorityIndex, setSelectedPriorityIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [allComments, setAllComments] = useState<any[]>([]);
  const [attachmentsMessage, setAttachmentsMessage] = useState<string | null>(null);
  const [uploadPath, setUploadPath] = useState('');
  const [isExternalEditing, setIsExternalEditing] = useState(false);
  const [ignoreEscapeUntil, setIgnoreEscapeUntil] = useState(0);
  const externalEditorBusyRef = useRef(false);
  const userSearchCacheRef = useRef<Map<string, Array<{ accountId: string; displayName: string; emailAddress?: string }>>>(new Map());

  const description = AdfConverter.adfToMarkdown(issue.fields.description);
  const parentIssue = issue.fields.parent;
  const parentKey = parentIssue?.key || '';
  const parentSummary = parentIssue?.fields?.summary || '';
  const currentAssignee = issue.fields.assignee?.displayName || 'Unassigned';
  const currentAssigneeAccountId = issue.fields.assignee?.accountId as string | undefined;
  const assigneeIsMe = Boolean(currentAccountId && currentAssigneeAccountId === currentAccountId);
  const comments = issue.fields.comment?.comments || [];
  const attachments = issue.fields.attachment || [];
  const isEpicIssue = String(issue.fields.issuetype?.name || '').trim().toLowerCase() === 'epic';
  const terminalRows = stdout?.rows || 24;
  const compactViewport = terminalRows <= 32;
  const previewWidth = Math.max(20, (stdout?.columns || 80) - 10);
  const descriptionPreviewLines = compactViewport ? 3 : 5;
  const activeTransition = pendingTransitionId
    ? transitions.find((transition) => transition.id === pendingTransitionId)
    : null;
  const currentTransitionField = transitionFieldsQueue[transitionFieldCursor];
  const currentTransitionAllowedValues = Array.isArray(currentTransitionField?.definition?.allowedValues)
    ? currentTransitionField.definition.allowedValues
    : [];
  const isCurrentTransitionFieldSelect = currentTransitionAllowedValues.length > 0;
  const currentTransitionSchemaType = String(currentTransitionField?.definition?.schema?.type || '').toLowerCase();
  const currentTransitionSchemaItems = String(currentTransitionField?.definition?.schema?.items || '').toLowerCase();
  const isCurrentTransitionUserField = !isCurrentTransitionFieldSelect && (
    currentTransitionSchemaType === 'user' ||
    (currentTransitionSchemaType === 'array' && currentTransitionSchemaItems === 'user')
  );

  useEffect(() => {
    if (selectedTransitionIndex < transitions.length) return;
    setSelectedTransitionIndex(Math.max(0, transitions.length - 1));
  }, [selectedTransitionIndex, transitions.length]);

  useEffect(() => {
    if (mode !== 'transition-fields' || !isCurrentTransitionUserField || !onSearchUsers) {
      setTransitionUserLoading(false);
      setTransitionUserOptions([]);
      setTransitionUserIndex(0);
      return;
    }

    const query = transitionFieldInput.trim();
    if (!query) {
      setTransitionUserLoading(false);
      setTransitionUserOptions([]);
      setTransitionUserIndex(0);
      return;
    }

    const cacheKey = query.toLowerCase();
    const cached = userSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setTransitionUserOptions(cached);
      setTransitionUserIndex(0);
      setTransitionUserLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setTransitionUserLoading(true);
      try {
        const users = await onSearchUsers(query);
        if (cancelled) return;
        const normalized = (users || []).slice(0, 8);
        userSearchCacheRef.current.set(cacheKey, normalized);
        setTransitionUserOptions(normalized);
        setTransitionUserIndex(0);
      } catch {
        if (!cancelled) {
          setTransitionUserOptions([]);
          setTransitionUserIndex(0);
        }
      } finally {
        if (!cancelled) {
          setTransitionUserLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, isCurrentTransitionUserField, onSearchUsers, transitionFieldInput, currentTransitionField?.id]);

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
  const selectableItems = ['status', 'assignee', 'priority', 'title'];
  if (isEpicIssue) {
    selectableItems.push('add-child-ticket');
  }
  selectableItems.push('description', 'comments', 'attachments', 'add-comment');
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

  useEffect(() => {
    setPendingTransitionId(null);
    setTransitionFieldsQueue([]);
    setTransitionFieldCursor(0);
    setTransitionFieldValues({});
    setTransitionFieldInput('');
    setTransitionAllowedIndex(0);
  }, [issue.key]);

  // Handle keyboard input
  useInput((input, key) => {
    if (Date.now() < ignoreEscapeUntil) {
      return;
    }

    // External editor for long-form fields
    if ((key.ctrl && input === 'e') && (mode === 'edit-description' || mode === 'add-comment' || mode === 'edit-comment')) {
      if (externalEditorBusyRef.current || isExternalEditing) {
        return;
      }
      externalEditorBusyRef.current = true;
      setIsExternalEditing(true);
      setSaving(true);
      void (async () => {
        try {
          const result = await openExternalEditor({
            content: editValue,
            extension: 'md',
          });
          if (result.success && result.content !== undefined) {
            setEditValue(result.content);
          } else if (result.error) {
            setError(result.error);
          }
        } finally {
          setSaving(false);
          setIsExternalEditing(false);
          externalEditorBusyRef.current = false;
          // Ignore trailing ESC emitted by editor quit sequences.
          setIgnoreEscapeUntil(Date.now() + 300);
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
      if (mode === 'transition-fields') {
        setMode('select-status');
        resetTransitionFieldFlow();
        setError(null);
        return;
      }
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
      if (transitionLoading) {
        return;
      }
      if (key.upArrow) {
        setSelectedTransitionIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedTransitionIndex(prev => Math.min(transitions.length - 1, prev + 1));
      } else if (key.return && transitions.length > 0) {
        void beginTransition();
      }
      return;
    }

    if (mode === 'transition-fields') {
      if (isCurrentTransitionFieldSelect) {
        if (key.upArrow) {
          setTransitionAllowedIndex((prev) =>
            Math.max(0, prev - 1)
          );
        } else if (key.downArrow) {
          setTransitionAllowedIndex((prev) =>
            Math.min(currentTransitionAllowedValues.length - 1, prev + 1)
          );
        } else if (key.return) {
          submitCurrentTransitionAllowedField();
        }
      } else if (isCurrentTransitionUserField && transitionUserOptions.length > 0) {
        if (key.upArrow) {
          setTransitionUserIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setTransitionUserIndex((prev) => Math.min(transitionUserOptions.length - 1, prev + 1));
        }
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
  }, { isActive: !isExternalEditing });

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

  function resetTransitionFieldFlow() {
    setPendingTransitionId(null);
    setTransitionFieldsQueue([]);
    setTransitionFieldCursor(0);
    setTransitionFieldValues({});
    setTransitionFieldInput('');
    setTransitionAllowedIndex(0);
    setTransitionUserLoading(false);
    setTransitionUserOptions([]);
    setTransitionUserIndex(0);
  }

  async function applyTransition(transitionId: string, fields?: Record<string, any>) {
    if (saving || !transitionId) return;
    setSaving(true);
    setError(null);

    try {
      if (onTransition) {
        await onTransition(transitionId, fields);
      }
      if (onRefresh) await onRefresh();
      if (onRefreshTransitions) await onRefreshTransitions();
      setMode('view');
      resetTransitionFieldFlow();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Status change failed';
      const requiredFieldNames = extractRequiredFieldNamesFromError(errorMessage);

      if (requiredFieldNames.length > 0 && onResolveTransitionFields) {
        try {
          const resolvedFields = await onResolveTransitionFields(transitionId, requiredFieldNames);
          const queue = buildQueueForNamedRequiredFields(resolvedFields, requiredFieldNames);
          if (queue.length > 0) {
            const firstField = queue[0];
            setPendingTransitionId(transitionId);
            setTransitionFieldsQueue(queue);
            setTransitionFieldCursor(0);
            setTransitionFieldValues(fields || {});
            setTransitionAllowedIndex(0);
            if (
              Array.isArray(firstField?.definition?.allowedValues) &&
              firstField.definition.allowedValues.length > 0
            ) {
              setTransitionFieldInput('');
            } else if (typeof firstField?.definition?.defaultValue === 'string') {
              setTransitionFieldInput(firstField.definition.defaultValue);
            } else {
              setTransitionFieldInput('');
            }
            setMode('transition-fields');
            setError(`Fill required field${queue.length > 1 ? 's' : ''} to continue.`);
            return;
          }
        } catch {
          // Fall through to existing error handling.
        }
      }

      if (onRefreshTransitions) {
        try {
          await onRefreshTransitions();
        } catch {
          // Keep showing the original transition error if refresh fails.
        }
      }
      setError(errorMessage);
      setMode('select-status');
      resetTransitionFieldFlow();
    } finally {
      setSaving(false);
    }
  }

  async function beginTransition() {
    if (transitionLoading) return;
    const selectedTransition = transitions[selectedTransitionIndex];
    if (!selectedTransition) return;

    let transitionWithFields = selectedTransition;
    if (onResolveTransitionFields) {
      try {
        const resolvedFields = await onResolveTransitionFields(selectedTransition.id);
        if (Object.keys(resolvedFields).length > 0) {
          transitionWithFields = {
            ...selectedTransition,
            fields: resolvedFields,
          };
        }
      } catch {
        // Ignore metadata fetch issues and fallback to current transition payload.
      }
    }

    const requiredFields = getRequiredTransitionFields(transitionWithFields);
    if (requiredFields.length === 0) {
      await applyTransition(selectedTransition.id);
      return;
    }

    setPendingTransitionId(transitionWithFields.id);
    setTransitionFieldsQueue(requiredFields);
    setTransitionFieldCursor(0);
    setTransitionFieldValues({});
    setTransitionAllowedIndex(0);
    if (
      Array.isArray(requiredFields[0]?.definition?.allowedValues) &&
      requiredFields[0].definition.allowedValues.length > 0
    ) {
      setTransitionFieldInput('');
    } else if (typeof requiredFields[0]?.definition?.defaultValue === 'string') {
      setTransitionFieldInput(requiredFields[0].definition.defaultValue);
    } else {
      setTransitionFieldInput('');
    }
    setMode('transition-fields');
  }

  async function openStatusSelector() {
    setError(null);
    resetTransitionFieldFlow();
    if (onRefreshTransitions) {
      setTransitionLoading(true);
      try {
        await onRefreshTransitions();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh available transitions');
      } finally {
        setTransitionLoading(false);
      }
    }
    setSelectedTransitionIndex(0);
    setMode('select-status');
  }

  function commitCurrentTransitionField(value: any) {
    const activeField = currentTransitionField;
    if (!activeField || !pendingTransitionId) return;

    const nextValues = {
      ...transitionFieldValues,
      [activeField.id]: value,
    };
    setTransitionFieldValues(nextValues);
    setError(null);

    if (transitionFieldCursor >= transitionFieldsQueue.length - 1) {
      void applyTransition(pendingTransitionId, nextValues);
      return;
    }

    const nextCursor = transitionFieldCursor + 1;
    const nextField = transitionFieldsQueue[nextCursor];
    setTransitionFieldCursor(nextCursor);
    setTransitionAllowedIndex(0);
    if (Array.isArray(nextField?.definition?.allowedValues) && nextField.definition.allowedValues.length > 0) {
      setTransitionFieldInput('');
    } else if (typeof nextField?.definition?.defaultValue === 'string') {
      setTransitionFieldInput(nextField.definition.defaultValue);
    } else {
      setTransitionFieldInput('');
    }
  }

  function submitCurrentTransitionTextField() {
    if (!currentTransitionField) return;

    const rawInput = transitionFieldInput.trim();
    if (!rawInput) {
      setError(`${currentTransitionField.name} is required.`);
      return;
    }

    const parsed = buildFieldValueFromText(
      currentTransitionField.id,
      currentTransitionField.definition,
      rawInput
    );
    commitCurrentTransitionField(parsed);
  }

  function submitCurrentTransitionInput() {
    if (isCurrentTransitionUserField && transitionUserOptions.length > 0) {
      const selected = transitionUserOptions[transitionUserIndex] || transitionUserOptions[0];
      if (selected?.accountId) {
        commitCurrentTransitionField({ accountId: selected.accountId });
        return;
      }
    }

    submitCurrentTransitionTextField();
  }

  function submitCurrentTransitionAllowedField() {
    if (!currentTransitionField || currentTransitionAllowedValues.length === 0) return;

    const selected = currentTransitionAllowedValues[transitionAllowedIndex];
    if (!selected) {
      setError(`${currentTransitionField.name} is required.`);
      return;
    }

    const parsed = buildFieldValueFromAllowed(currentTransitionField.id, selected);
    commitCurrentTransitionField(parsed);
  }

  const handleSelect = () => {
    setError(null);
    const item = selectableItems[selectedIndex];

    switch (item) {
      case 'status':
        void openStatusSelector();
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
      case 'add-child-ticket':
        onCreateChildTicket?.();
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
    setTransitionLoading(false);
    setEditValue('');
    setEditingCommentId(null);
    setError(null);
    setSelectedIndex(0);
    resetTransitionFieldFlow();
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
            {transitionLoading && <Text color={te.muted}>Refreshing available transitions...</Text>}
            {!transitionLoading && transitions.length === 0 && (
              <Text color={te.warning}>No status transitions are available from the current state.</Text>
            )}
            {!transitionLoading && transitions.map((t, i) => {
              const requiredCount = getRequiredTransitionFields(t).length;
              return (
                <Text
                  key={t.id}
                  color={i === selectedTransitionIndex ? te.accentAlt : te.fg}
                  bold={i === selectedTransitionIndex}
                >
                  {i === selectedTransitionIndex ? '▶ ' : '  '}
                  {t.name} → {t.to.name}
                  {requiredCount > 0 ? ` (${requiredCount} required field${requiredCount > 1 ? 's' : ''})` : ''}
                </Text>
              );
            })}
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

  if (mode === 'transition-fields') {
    if (!activeTransition || !currentTransitionField) {
      return (
        <Box flexDirection="column" width="100%">
          {error && <Text color="red">Error: {error}</Text>}
          <Text color={te.warning}>Missing transition field metadata. Press Escape and retry.</Text>
        </Box>
      );
    }

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
            📋 Required Field ({transitionFieldCursor + 1}/{transitionFieldsQueue.length})
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text color="white">{currentTransitionField.name}</Text>
            <Text dimColor>{getTransitionFieldInputHint(currentTransitionField.definition)}</Text>
          </Box>

          {isCurrentTransitionFieldSelect ? (
            <Box marginTop={1} flexDirection="column">
              {currentTransitionAllowedValues.map((option, idx) => (
                <Text
                  key={`${currentTransitionField.id}-${idx}`}
                  color={idx === transitionAllowedIndex ? te.accentAlt : te.fg}
                  bold={idx === transitionAllowedIndex}
                >
                  {idx === transitionAllowedIndex ? '▶ ' : '  '}
                  {formatAllowedValueLabel(option)}
                </Text>
              ))}
            </Box>
          ) : (
            <Box marginTop={1} borderStyle="round" borderColor={te.accent} paddingX={1}>
              <TextInput
                value={transitionFieldInput}
                onChange={setTransitionFieldInput}
                onSubmit={submitCurrentTransitionInput}
                placeholder={`Enter ${currentTransitionField.name}...`}
                focus={!saving && !isExternalEditing}
              />
            </Box>
          )}

          {!isCurrentTransitionFieldSelect && isCurrentTransitionUserField && (
            <Box marginTop={1} flexDirection="column">
              {transitionUserLoading && <Text color={te.muted}>Searching users...</Text>}
              {!transitionUserLoading && transitionUserOptions.length > 0 && transitionUserOptions.map((user, idx) => (
                <Text
                  key={`${currentTransitionField.id}:${user.accountId}`}
                  color={idx === transitionUserIndex ? te.accentAlt : te.fg}
                  bold={idx === transitionUserIndex}
                >
                  {idx === transitionUserIndex ? '▶ ' : '  '}
                  {user.displayName}
                  {user.emailAddress ? ` (${user.emailAddress})` : ''}
                </Text>
              ))}
              {!transitionUserLoading && transitionFieldInput.trim().length > 0 && transitionUserOptions.length === 0 && (
                <Text color={te.muted}>No matching users found. Press Enter to use the typed value.</Text>
              )}
            </Box>
          )}
        </Box>

        {saving && <Text dimColor>Updating status...</Text>}

        <Box marginTop={1}>
          <ShortcutHints
            hints={
              isCurrentTransitionFieldSelect
                ? [
                  { key: '↑/↓', label: 'Choose' },
                  { key: 'Enter', label: 'Next' },
                  { key: 'Escape', label: 'Cancel' },
                ]
                : [
                  ...(isCurrentTransitionUserField
                    ? [{ key: '↑/↓', label: 'User' } as const]
                    : []),
                  { key: 'Enter', label: 'Next' },
                  { key: 'Escape', label: 'Cancel' },
                ]
            }
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
              focus={!saving && !isExternalEditing}
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
        <Text bold backgroundColor={te.accent} color="black">
          {' '}
          {issue.key}
          {' '}
        </Text>
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

      {isEpicIssue && (
        <SelectableItem
          label="ADD CHILD TICKET"
          content="Create a ticket linked to this epic"
          isSelected={isSelectedItem('add-child-ticket')}
          actionLabel="[CREATE]"
          compact
        />
      )}

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
