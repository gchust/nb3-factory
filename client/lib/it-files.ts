import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';
import { useCallback, useMemo, useState } from 'react';

import type { ItFile } from './it-api.js';

/**
 * Attachment helpers backed by the file plugin's repository.
 *
 * Upload returns the stored metadata (including a decorated `contentUrl`); persisted records come
 * back from our own API without one, so `attachmentUrl` rebuilds the same public path from the base
 * the portal is actually served under.
 */
export function attachmentUrl(file: {
  readonly id: string;
  readonly ext: string;
  readonly contentUrl?: string;
}): string {
  if (file.contentUrl) return file.contentUrl;
  const base = getPortalBase().replace(/\/+$/, '');
  const suffix = file.ext ? `.${encodeURIComponent(file.ext)}` : '';
  return `${base}/uploads/it-attachments/${encodeURIComponent(file.id)}${suffix}`;
}

export function useAttachmentUploader(): {
  upload: (files: readonly File[]) => Promise<readonly ItFile[]>;
  uploading: boolean;
  error: string;
  clearError: () => void;
} {
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('itAttachments'),
    [manager],
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const upload = useCallback(
    async (files: readonly File[]): Promise<readonly ItFile[]> => {
      if (files.length === 0) return [];
      setUploading(true);
      setError('');
      try {
        const records: readonly FileRecord[] =
          files.length === 1
            ? [(await repository.uploadOne({ file: files[0] })).record]
            : (await repository.uploadMany({ files: [...files] })).records;
        return records.map((record) => ({
          id: record.id,
          filename: record.filename,
          ext: record.ext,
          mimeType: record.mimeType,
          size: record.size,
          contentUrl: record.contentUrl,
        }));
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : 'Upload failed';
        setError(message);
        throw cause;
      } finally {
        setUploading(false);
      }
    },
    [repository],
  );

  return {
    upload,
    uploading,
    error,
    clearError: useCallback(() => setError(''), []),
  };
}
