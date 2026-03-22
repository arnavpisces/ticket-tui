import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { JiraClient, JiraTransition, JiraPriority, JiraTransitionField } from '../../api/jira-client.js';
import { useJiraIssue } from '../../hooks/useJiraIssue.js';
import { TicketDetail } from './TicketDetail.js';
import { TicketList } from './TicketList.js';
import { FuzzySelect } from '../common/FuzzySelect.js';
import { CreateTicket } from './CreateTicket.js';
import { QuickFilters, QuickFilterContext } from './QuickFilters.js';
import { JqlSearch } from './JqlSearch.js';
import { SavedList } from '../common/SavedList.js';
import { MenuList } from '../common/MenuList.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { listBookmarks, removeBookmark } from '../../storage/bookmarks.js';
import { listRecents } from '../../storage/recents.js';
import { PersistentCache } from '../../storage/cache.js';
import { te } from '../../theme/te.js';

type ViewMode =
  | 'menu'
  | 'list'
  | 'fuzzy-search'
  | 'quick-filters'
  | 'jql-search'
  | 'create'
  | 'bookmarks'
  | 'recents'
  | 'detail';

export interface JiraViewProps {
  client: JiraClient;
  baseUrl: string;
  onJiraDataChanged?: (openDelta?: number, totalDelta?: number) => void;
}

const jiraSearchCache = new PersistentCache<any[]>('jira:search', 300);
const jiraTicketListCache = new PersistentCache<any>('jira:ticket-list', 300);
const jiraQuickCache = new PersistentCache<any[]>('jira:quick', 300);
const jiraJqlCache = new PersistentCache<any[]>('jira:jql', 300);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column">
          <Text color="red">Error: {this.state.error?.message || 'Unknown error'}</Text>
          <Box marginTop={1}>
            <ShortcutHints hints={[{ key: 'Escape', label: 'Back' }]} />
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

export function JiraView({ client, baseUrl, onJiraDataChanged }: JiraViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('menu');
  const [selectedKey, setSelectedKey] = useState('');
  const [detailReturnView, setDetailReturnView] = useState<ViewMode>('menu');
  const { issue, loading, error, refetch } = useJiraIssue(client, selectedKey, baseUrl);
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);
  const [transitions, setTransitions] = useState<JiraTransition[]>([]);
  const [priorities, setPriorities] = useState<JiraPriority[]>([]);
  const [currentAccountId, setCurrentAccountId] = useState<string | undefined>();
  const [searchReturnView, setSearchReturnView] = useState<ViewMode>('menu');
  const [bookmarksVersion, setBookmarksVersion] = useState(0);
  const [createReturnView, setCreateReturnView] = useState<ViewMode>('menu');
  const [createDefaults, setCreateDefaults] = useState<{
    projectKey?: string;
    parentEpicKey?: string;
    parentEpicLabel?: string;
  } | null>(null);
  const [quickFilterContext, setQuickFilterContext] = useState<QuickFilterContext | null>(null);
  const issueStatusToken = `${issue?.fields.status?.id || ''}:${issue?.fields.status?.name || ''}`;

  const isClosedForMetric = (statusName: string): boolean =>
    /(closed|complete|completed|cancelled|canceled)/i.test(statusName);

  const menuItems = [
    { label: 'Browse All Tickets', value: 'list' },
    { label: 'Search Tickets', value: 'fuzzy-search' },
    { label: 'Quick Filters', value: 'quick-filters' },
    { label: 'JQL Search', value: 'jql-search' },
    { label: 'Create Ticket', value: 'create' },
    { label: 'Bookmarks', value: 'bookmarks' },
    { label: 'Recent', value: 'recents' },
  ];

  // Fetch current user's account ID on mount
  useEffect(() => {
    const fetchMyself = async () => {
      try {
        const myself = await client.getMyself();
        setCurrentAccountId(myself.accountId);
      } catch {
        // Ignore - edit comment will just not show
      }

      try {
        const allPriorities = await client.getPriorities();
        setPriorities(allPriorities);
      } catch {
        setPriorities([]);
      }
    };
    fetchMyself();
  }, [client]);

  const refreshTransitions = useCallback(async () => {
    if (!selectedKey) {
      setTransitions([]);
      return;
    }

    try {
      const latest = await client.getTransitions(selectedKey);
      setTransitions(latest);
    } catch {
      setTransitions([]);
    }
  }, [client, selectedKey]);

  // Fetch transitions when viewing a ticket and whenever the status changes.
  useEffect(() => {
    if (viewMode !== 'detail' || !selectedKey) return;
    void refreshTransitions();
  }, [viewMode, selectedKey, issueStatusToken, refreshTransitions]);

  const handleMenuSelect = (item: any) => {
    if (item.value === 'list') {
      setViewMode('list');
    } else if (item.value === 'fuzzy-search') {
      setSearchReturnView('menu');
      setViewMode('fuzzy-search');
    } else if (item.value === 'quick-filters') {
      setQuickFilterContext(null);
      setViewMode('quick-filters');
    } else if (item.value === 'jql-search') {
      setViewMode('jql-search');
    } else if (item.value === 'create') {
      setCreateDefaults(null);
      setCreateReturnView('menu');
      setViewMode('create');
    } else if (item.value === 'bookmarks') {
      setViewMode('bookmarks');
    } else if (item.value === 'recents') {
      setViewMode('recents');
    }
  };

  const handleTicketSearch = async (query: string) => {
    const normalized = query.trim();
    if (!normalized) return [];
    const cacheKey = normalized.toLowerCase();
    const cached = jiraSearchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const escaped = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const primaryJql = `summary ~ "${escaped}*" OR key = "${normalized.toUpperCase()}" ORDER BY created DESC`;
    let { issues } = await client.searchIssues(primaryJql, 35);

    // If user typed only the numeric part (e.g. "123"), fetch latest issues and match KEY-123.
    if (issues.length === 0 && /^\d+$/.test(normalized)) {
      const fallback = await client.searchIssues('created IS NOT EMPTY ORDER BY created DESC', 200);
      const suffix = `-${normalized}`;
      issues = fallback.issues.filter(issue => issue.key.toUpperCase().endsWith(suffix.toUpperCase()));
    }

    const results = issues.slice(0, 35).map(i => ({
      label: `${i.key}: ${i.fields.summary} (${i.fields.status.name})`,
      value: i.key,
      key: i.key
    }));
    jiraSearchCache.set(cacheKey, results);
    return results;
  };

  const openIssue = (key: string, from: ViewMode = viewMode) => {
    setDetailReturnView(from);
    setSelectedKey(key);
    setViewMode('detail');
  };

  const handleTicketSelect = (key: string) => {
    openIssue(key);
  };

  const handleQuickFilterIssueSelect = (key: string, context?: QuickFilterContext) => {
    setQuickFilterContext(context || null);
    openIssue(key, 'quick-filters');
  };

  const goBack = () => {
    if (viewMode === 'detail') {
      setSelectedKey('');
      setTransitions([]);
      setViewMode(detailReturnView === 'detail' ? 'menu' : detailReturnView);
    } else {
      setSelectedKey('');
      setTransitions([]);
      setViewMode('menu');
    }
    setErrorBoundaryKey(prev => prev + 1);
  };

  // Handle save title
  function invalidateJiraIssueCaches() {
    jiraSearchCache.clear();
    jiraTicketListCache.clear();
    jiraQuickCache.clear();
    jiraJqlCache.clear();
  }

  const handleCreated = (key: string) => {
    invalidateJiraIssueCaches();
    onJiraDataChanged?.();
    openIssue(key, 'create');
  };

  const handleCreateChildFromEpic = () => {
    if (!issue) return;
    const isEpic = String(issue.fields.issuetype?.name || '').trim().toLowerCase() === 'epic';
    if (!isEpic) return;

    const inferredProjectKey =
      issue.fields.project?.key ||
      (selectedKey.includes('-') ? selectedKey.split('-')[0] : '');

    setCreateDefaults({
      projectKey: inferredProjectKey || undefined,
      parentEpicKey: issue.key,
      parentEpicLabel: `${issue.key}: ${issue.fields.summary}`,
    });
    setCreateReturnView('detail');
    setViewMode('create');
  };

  const handleSaveTitle = async (title: string) => {
    if (!selectedKey) return;
    await client.updateIssue(selectedKey, { summary: title });
    invalidateJiraIssueCaches();
  };

  // Handle save description
  const handleSaveDescription = async (description: string) => {
    if (!selectedKey) return;
    const adfDescription = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: description }],
        },
      ],
    };
    await client.updateIssue(selectedKey, { description: adfDescription });
    invalidateJiraIssueCaches();
  };

  const handleSavePriority = async (priorityId: string) => {
    if (!selectedKey) return;
    await client.updateIssue(selectedKey, {
      priority: priorityId ? { id: priorityId } : null,
    });
    invalidateJiraIssueCaches();
  };

  const handleAssignToMe = async () => {
    if (!selectedKey) return;
    const wasAssignedToMe = Boolean(
      currentAccountId &&
      issue?.fields.assignee?.accountId &&
      issue.fields.assignee.accountId === currentAccountId
    );
    await client.assignIssueToMe(selectedKey);
    invalidateJiraIssueCaches();
    if (wasAssignedToMe) return; // Already mine, no metric change
    const statusName = String(issue?.fields.status?.name || '');
    const isOpen = !isClosedForMetric(statusName);
    // New assignment: total +1, open +1 only if it is not closed/completed/cancelled.
    onJiraDataChanged?.(isOpen ? 1 : 0, 1);
  };

  // Handle add comment
  const handleAddComment = async (comment: string) => {
    if (!selectedKey) return;
    const adfComment = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: comment }],
        },
      ],
    };
    await client.addComment(selectedKey, adfComment);
  };

  // Handle update comment
  const handleUpdateComment = async (commentId: string, comment: string) => {
    if (!selectedKey) return;
    const adfComment = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: comment }],
        },
      ],
    };
    await client.updateComment(selectedKey, commentId, adfComment);
  };

  const handleSearchUsers = async (query: string) => {
    return client.searchUsers(query, 8);
  };

  // Handle status transition
  const handleTransition = async (transitionId: string, transitionFields?: Record<string, any>) => {
    if (!selectedKey) return;

    const selectedTransition = transitions.find(t => t.id === transitionId);
    const isAssignedToMe = Boolean(
      currentAccountId &&
      issue?.fields.assignee?.accountId &&
      issue.fields.assignee.accountId === currentAccountId
    );

    await client.transitionIssue(selectedKey, transitionId, transitionFields);
    invalidateJiraIssueCaches();
    await refreshTransitions();

    if (!isAssignedToMe || !selectedTransition) {
      // Not assigned to me or unknown transition — just trigger a re-fetch
      onJiraDataChanged?.();
      return;
    }

    const wasOpen = !isClosedForMetric(String(issue?.fields.status?.name || ''));
    const willBeOpen = !isClosedForMetric(String(selectedTransition.to.name || ''));

    if (wasOpen && !willBeOpen) {
      // Moved into closed/completed/cancelled bucket.
      onJiraDataChanged?.(-1, 0);
    } else if (!wasOpen && willBeOpen) {
      // Moved out of closed/completed/cancelled bucket.
      onJiraDataChanged?.(1, 0);
    } else {
      // Same open/closed state — just re-fetch
      onJiraDataChanged?.();
    }
  };

  const resolveTransitionFields = async (
    transitionId: string,
    requiredFieldNames: string[] = []
  ): Promise<Record<string, JiraTransitionField>> => {
    if (!selectedKey) return {};

    const merged: Record<string, JiraTransitionField> = {};

    const fromList = transitions.find((transition) => transition.id === transitionId);
    if (fromList?.fields) {
      Object.assign(merged, fromList.fields);
    }

    try {
      const detailed = await client.getTransitionById(selectedKey, transitionId);
      if (detailed?.fields) {
        Object.assign(merged, detailed.fields);
      }
    } catch {
      // Ignore and fallback to already fetched metadata.
    }

    if (requiredFieldNames.length > 0) {
      try {
        const editFields = await client.getEditMetaFields(selectedKey);
        const required = new Set(requiredFieldNames.map((name) => name.trim().toLowerCase()));
        for (const [fieldId, definition] of Object.entries(editFields || {})) {
          const normalizedId = fieldId.trim().toLowerCase();
          const normalizedName = String(definition?.name || '').trim().toLowerCase();
          if (required.has(normalizedId) || required.has(normalizedName)) {
            merged[fieldId] = {
              ...definition,
              required: true,
              operations: Array.isArray(definition.operations) ? definition.operations : ['set'],
            };
          }
        }
      } catch {
        // Ignore fallback metadata failures.
      }
    }

    return merged;
  };

  // Handle keyboard shortcuts (only for non-detail views - detail handles its own escape)
  // Use isActive to disable when menu is shown (SelectInput handles arrow keys in menu mode)
  useInput((input, key) => {
    // Escape to go back (only for list/search/create modes - detail mode handles its own)
    if (key.escape && viewMode !== 'menu' && viewMode !== 'detail') {
      goBack();
    }
    // Slash to search from list view
    else if (input === '/' && viewMode === 'list') {
      setSearchReturnView('list');
      setViewMode('fuzzy-search');
    }
    // Ctrl+R to refresh
    else if (key.ctrl && input === 'r' && viewMode === 'detail' && selectedKey) {
      refetch();
    }
  }, { isActive: viewMode !== 'menu' });

  // Menu view
  if (viewMode === 'menu') {
    return (
      <Box
        flexDirection="column"
        width="100%"
        borderStyle="single"
        borderColor={te.accent}
        paddingX={1}
      >
        <Box paddingLeft={2}>
          <Text bold color={te.accentAlt}>JIRA CONTROL PANEL</Text>
        </Box>
        <MenuList
          items={menuItems}
          onSelect={handleMenuSelect}
          isActive={viewMode === 'menu'}
        />
        <Box paddingLeft={2}>
          <ShortcutHints
            hints={[
              { key: 'Enter', label: 'Select' },
              { key: 'Ctrl+Q', label: 'Quit' },
            ]}
          />
        </Box>
      </Box>
    );
  }

  // List view (all tickets)
  if (viewMode === 'list') {
    return (
      <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
        <TicketList
          client={client}
          onSelectTicket={handleTicketSelect}
          onCancel={goBack}
        />
      </ErrorBoundary>
    );
  }

  // Fuzzy search view
  if (viewMode === 'fuzzy-search') {
    return (
      <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
        <FuzzySelect
          label="Search Jira Tickets"
          onSearch={handleTicketSearch}
          onSelect={handleTicketSelect}
          onBack={() => setViewMode(searchReturnView)}
          placeholder="Type summary or key..."
          minQueryLength={2}
        />
      </ErrorBoundary>
    );
  }

  if (viewMode === 'quick-filters') {
    return (
      <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
        <QuickFilters
          client={client}
          onSelectIssue={handleQuickFilterIssueSelect}
          initialContext={quickFilterContext}
          onContextChange={setQuickFilterContext}
          onCancel={goBack}
        />
      </ErrorBoundary>
    );
  }

  if (viewMode === 'jql-search') {
    return (
      <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
        <JqlSearch
          client={client}
          onSelectIssue={handleTicketSelect}
          onCancel={goBack}
        />
      </ErrorBoundary>
    );
  }

  if (viewMode === 'bookmarks') {
    const bookmarks = listBookmarks('jira');
    return (
      <SavedList
        key={bookmarksVersion}
        title="Jira Bookmarks"
        items={bookmarks.map(b => ({
          id: b.id,
          title: b.title,
          subtitle: b.key,
          value: b.key,
        }))}
        onSelect={(key) => {
          openIssue(key, 'bookmarks');
        }}
        onRemove={(key) => {
          removeBookmark('jira', key);
          setBookmarksVersion(v => v + 1);
        }}
        onBack={goBack}
        emptyMessage="No Jira bookmarks yet."
      />
    );
  }

  if (viewMode === 'recents') {
    const recents = listRecents('jira');
    return (
      <SavedList
        title="Recent Jira Issues"
        items={recents.map(r => ({
          id: r.id,
          title: r.title,
          subtitle: r.key,
          value: r.key,
        }))}
        onSelect={(key) => {
          openIssue(key, 'recents');
        }}
        onBack={goBack}
        emptyMessage="No recent Jira issues yet."
      />
    );
  }

  // Create Ticket View
  if (viewMode === 'create') {
    return (
      <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
        <CreateTicket
          client={client}
          onCreated={handleCreated}
          onCancel={() => {
            if (createReturnView === 'detail' && selectedKey) {
              setViewMode('detail');
              return;
            }
            goBack();
          }}
          initialProjectKey={createDefaults?.projectKey}
          initialParentEpicKey={createDefaults?.parentEpicKey}
          initialParentEpicLabel={createDefaults?.parentEpicLabel}
        />
      </ErrorBoundary>
    );
  }

  // Detail view with interactive selection
  return (
    <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
      <Box flexDirection="column" width="100%">
        {loading && <Text>Loading issue {selectedKey}...</Text>}

        {error && (
          <Box flexDirection="column">
            <Text color="red">Error: {error.message}</Text>
            <Box marginTop={1}>
              <ShortcutHints hints={[{ key: 'Escape', label: 'Back' }]} />
            </Box>
          </Box>
        )}

      {issue && (
        <TicketDetail
          issue={issue}
          baseUrl={baseUrl}
          currentAccountId={currentAccountId}
          transitions={transitions}
          priorities={priorities}
          onSaveTitle={handleSaveTitle}
          onSaveDescription={handleSaveDescription}
          onSavePriority={handleSavePriority}
          onAssignToMe={handleAssignToMe}
          onAddComment={handleAddComment}
          onUpdateComment={handleUpdateComment}
          onTransition={handleTransition}
          onRefreshTransitions={refreshTransitions}
          onSearchUsers={handleSearchUsers}
          onResolveTransitionFields={resolveTransitionFields}
          onFetchComments={() => client.getComments(issue.key).then(r => r.comments as any)}
          onDownloadAttachment={async (attachmentId, filename) => {
            const data = await client.downloadAttachment(attachmentId);
            return { data, filename };
          }}
          onUploadAttachment={(filePath) => client.uploadAttachment(issue.key, filePath)}
          onBookmarkChanged={() => setBookmarksVersion(v => v + 1)}
          onCreateChildTicket={handleCreateChildFromEpic}
          onRefresh={refetch}
          onBack={goBack}
        />
      )}
      </Box>
    </ErrorBoundary>
  );
}
