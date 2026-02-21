import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfluenceClient } from '../../api/confluence-client.js';
import { useConfluencePage } from '../../hooks/useConfluencePage.js';
import { PageBrowser } from './PageBrowser.js';
import { PageList } from './PageList.js';
import { PageViewer } from './PageViewer.js';
import { PageEditor } from './PageEditor.js';
import { SpaceTree } from './SpaceTree.js';
import { PageComments } from './PageComments.js';
import { PageLabels } from './PageLabels.js';
import { PageAttachments } from './PageAttachments.js';
import { SavedList } from '../common/SavedList.js';
import { MenuList } from '../common/MenuList.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { listBookmarks, removeBookmark } from '../../storage/bookmarks.js';
import { listRecents } from '../../storage/recents.js';
import { te } from '../../theme/te.js';

type ViewMode =
  | 'menu'
  | 'list'
  | 'search'
  | 'spaces'
  | 'viewer'
  | 'editor'
  | 'comments'
  | 'labels'
  | 'attachments'
  | 'bookmarks'
  | 'recents';

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

export interface ConfluenceViewProps {
  client: ConfluenceClient;
}

export function ConfluenceView({ client }: ConfluenceViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('menu');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [viewerReturnView, setViewerReturnView] = useState<ViewMode>('menu');
  const { page, loading, error, refetch } = useConfluencePage(client, selectedPageId);
  const [saving, setSaving] = useState(false);
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);
  const [searchReturnView, setSearchReturnView] = useState<ViewMode>('menu');

  const menuItems = [
    { label: 'Browse All Pages', value: 'list' },
    { label: 'Search Pages', value: 'search' },
    { label: 'Browse by Space', value: 'spaces' },
    { label: 'Bookmarks', value: 'bookmarks' },
    { label: 'Recent', value: 'recents' },
  ];

  const handleMenuSelect = (item: any) => {
    if (item.value === 'list') {
      setViewMode('list');
    } else if (item.value === 'search') {
      setSearchReturnView('menu');
      setViewMode('search');
    } else if (item.value === 'spaces') {
      setViewMode('spaces');
    } else if (item.value === 'bookmarks') {
      setViewMode('bookmarks');
    } else if (item.value === 'recents') {
      setViewMode('recents');
    }
  };

  const handlePageSelect = useCallback((pageId: string) => {
    setViewerReturnView(viewMode);
    setSelectedPageId(pageId);
    setViewMode('viewer');
  }, [viewMode]);

  const handleSavePage = async (content: string) => {
    if (!page) return;
    setSaving(true);

    try {
      await client.updatePage(page.id, page.title, content, page.version.number);
      await refetch();
      // Keep viewer mode
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (viewMode === 'viewer') {
      setSelectedPageId('');
      setViewMode(viewerReturnView === 'viewer' ? 'menu' : viewerReturnView);
    } else if (
      viewMode === 'comments' ||
      viewMode === 'labels' ||
      viewMode === 'attachments' ||
      viewMode === 'editor'
    ) {
      setViewMode('viewer');
    } else if (viewMode === 'search') {
      setViewMode(searchReturnView);
    } else {
      setSelectedPageId('');
      setViewMode('menu');
    }
    setErrorBoundaryKey(prev => prev + 1); // Reset error boundary
  };

  useInput((input, key) => {
    if (key.escape && viewMode !== 'menu') {
      goBack();
    }
    else if (key.ctrl && input === 'r' && viewMode === 'viewer' && selectedPageId) {
      refetch();
    }
    else if (input === '/' && viewMode === 'list') {
      setSearchReturnView('list');
      setViewMode('search');
    }
    else if (key.ctrl && input === 'm' && viewMode === 'viewer') {
      setViewMode('comments');
    }
    else if (key.ctrl && input === 'l' && viewMode === 'viewer') {
      setViewMode('labels');
    }
    else if (key.ctrl && input === 'a' && viewMode === 'viewer') {
      setViewMode('attachments');
    }
  });

  const renderContent = () => {
    if (viewMode === 'menu') {
      return (
        <Box
          flexDirection="column"
          width="100%"
          borderStyle="single"
          borderColor={te.accent}
          paddingX={1}
        >
          <Box>
            <Text bold color={te.accentAlt}>CONFLUENCE CONTROL PANEL</Text>
          </Box>
          <MenuList
            items={menuItems}
            onSelect={handleMenuSelect}
            isActive={viewMode === 'menu'}
          />
          <Box>
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

    if (viewMode === 'list') {
      return (
        <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
          <PageList
            client={client}
            onSelectPage={handlePageSelect}
            onCancel={goBack}
          />
        </ErrorBoundary>
      );
    }

    if (viewMode === 'search') {
      return (
        <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
          <PageBrowser
            client={client}
            onPageSelect={handlePageSelect}
            onCancel={() => setViewMode(searchReturnView)}
          />
        </ErrorBoundary>
      );
    }

    if (viewMode === 'spaces') {
      return (
        <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
          <SpaceTree
            client={client}
            onSelectPage={handlePageSelect}
            activePageId={selectedPageId}
            isActive={true}
          />
        </ErrorBoundary>
      );
    }

    if (viewMode === 'viewer') {
      return (
        <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
          <Box flexDirection="column" width="100%">
            {loading && <Text>Loading page...</Text>}
            {error && (
              <Box flexDirection="column">
                <Text color="red">Error: {error.message}</Text>
                <Box marginTop={1}>
                  <ShortcutHints hints={[{ key: 'Escape', label: 'Back' }]} />
                </Box>
              </Box>
            )}
            {page && (
              <PageViewer
                page={page}
                onEdit={() => setViewMode('editor')}
                onBack={goBack}
                onSave={handleSavePage}
                isActive={true}
                onOpenComments={() => setViewMode('comments')}
                onOpenLabels={() => setViewMode('labels')}
                onOpenAttachments={() => setViewMode('attachments')}
                baseUrl={client.getBaseUrl()}
              />
            )}
          </Box>
        </ErrorBoundary>
      );
    }

    if (viewMode === 'comments' && page) {
      return (
        <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
          <PageComments
            client={client}
            page={page}
            onBack={() => setViewMode('viewer')}
          />
        </ErrorBoundary>
      );
    }

    if (viewMode === 'labels' && page) {
      return (
        <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
          <PageLabels
            client={client}
            page={page}
            onBack={() => setViewMode('viewer')}
          />
        </ErrorBoundary>
      );
    }

    if (viewMode === 'attachments' && page) {
      return (
        <ErrorBoundary key={errorBoundaryKey} onReset={goBack}>
          <PageAttachments
            client={client}
            page={page}
            onBack={() => setViewMode('viewer')}
          />
        </ErrorBoundary>
      );
    }

    if (viewMode === 'bookmarks') {
      const bookmarks = listBookmarks('confluence');
      return (
        <SavedList
          title="Confluence Bookmarks"
          items={bookmarks.map(b => ({
            id: b.id,
            title: b.title,
            subtitle: b.key,
            value: b.key,
          }))}
          onSelect={(id) => {
            handlePageSelect(id);
          }}
          onRemove={(id) => {
            removeBookmark('confluence', id);
            setErrorBoundaryKey(prev => prev + 1);
          }}
          onBack={goBack}
          emptyMessage="No Confluence bookmarks yet."
        />
      );
    }

    if (viewMode === 'recents') {
      const recents = listRecents('confluence');
      return (
        <SavedList
          title="Recent Confluence Pages"
          items={recents.map(r => ({
            id: r.id,
            title: r.title,
            subtitle: r.key,
            value: r.key,
          }))}
          onSelect={(id) => {
            handlePageSelect(id);
          }}
          onBack={goBack}
          emptyMessage="No recent Confluence pages yet."
        />
      );
    }

    return null;
  };

  return (
    <Box flexDirection="column" width="100%">
      {renderContent()}
    </Box>
  );
}
