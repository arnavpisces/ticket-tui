import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { ConfluenceClient, ConfluencePage, ConfluenceAttachment } from '../../api/confluence-client.js';
import { getDownloadsDir, normalizeDraggedPath } from '../../utils/paths.js';
import { openInBrowser, resolveUrl } from '../../utils/links.js';
import { ShortcutHints } from '../common/ShortcutHints.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { te } from '../../theme/te.js';

export interface PageAttachmentsProps {
  client: ConfluenceClient;
  page: ConfluencePage;
  onBack: () => void;
}

export function PageAttachments({ client, page, onBack }: PageAttachmentsProps) {
  const [attachments, setAttachments] = useState<ConfluenceAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPath, setUploadPath] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const loadAttachments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.getAttachments(page.id);
      setAttachments(res.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttachments();
  }, [page.id]);

  useInput((input, key) => {
    if (key.escape) {
      if (uploading) {
        setUploading(false);
        setUploadPath('');
      } else {
        onBack();
      }
    }
    if (!uploading && input === 'u') {
      setUploading(true);
      setUploadPath('');
    }
    if (!uploading && input === 'd' && attachments[selectedIndex]) {
      handleDownload(attachments[selectedIndex]);
    }
    if (!uploading && input === 'o' && attachments[selectedIndex]) {
      const download = attachments[selectedIndex]._links?.download || '';
      const url = resolveUrl(client.getBaseUrl(), download);
      openInBrowser(url);
    }
  });

  const handleDownload = async (attachment: ConfluenceAttachment) => {
    try {
      const download = attachment._links?.download || '';
      const data = await client.downloadAttachment(download);
      const dest = join(getDownloadsDir(), attachment.title);
      writeFileSync(dest, data);
      setStatus(`✓ Saved to ${dest}`);
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : 'Download failed'}`);
    } finally {
      setTimeout(() => setStatus(null), 3000);
    }
  };

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color={te.accentAlt}>Loading attachments...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      <Text bold color={te.accentAlt}>Attachments for {page.title}</Text>
      {error && <Text color="red">{error}</Text>}
      {status && <Text dimColor>{status}</Text>}

      {uploading ? (
        <Box marginTop={1}>
          <Text>Upload attachment (drag & drop path):</Text>
          <Box borderStyle="round" borderColor={te.accent} paddingX={1}>
            <TextInput
              value={uploadPath}
              onChange={setUploadPath}
              onSubmit={async () => {
                if (!uploadPath.trim()) return;
                try {
                  const normalized = normalizeDraggedPath(uploadPath);
                  await client.uploadAttachment(page.id, normalized);
                  setStatus('✓ Upload complete');
                  setUploading(false);
                  setUploadPath('');
                  loadAttachments();
                } catch (err) {
                  setStatus(`✗ ${err instanceof Error ? err.message : 'Upload failed'}`);
                } finally {
                  setTimeout(() => setStatus(null), 3000);
                }
              }}
              placeholder="~/Downloads/file.png"
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
      ) : attachments.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No attachments.</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <SelectInput
            items={attachments.map((a) => ({
              key: a.id,
              label: a.title,
              value: a.id,
            }))}
            onSelect={(item: any) => {
              const idx = attachments.findIndex((a) => a.id === item.value);
              if (idx >= 0) setSelectedIndex(idx);
            }}
            onHighlight={(item: any) => {
              const idx = attachments.findIndex((a) => a.id === item.value);
              if (idx >= 0) setSelectedIndex(idx);
            }}
            limit={12}
          />
        </Box>
      )}

      {!uploading && (
        <Box marginTop={1}>
          <ShortcutHints
            hints={[
              { key: 'u', label: 'Upload' },
              { key: 'd', label: 'Download' },
              { key: 'o', label: 'Open' },
              { key: 'Escape', label: 'Back' },
            ]}
          />
        </Box>
      )}
    </Box>
  );
}
