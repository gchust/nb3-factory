import type { FileRecord } from '../types';
import { resolveSafeFileUrl } from './file-url';

/**
 * Triggers a download for a file record. Kept out of the component files so
 * Fast Refresh keeps working and so the preview field and dialog share exactly
 * one implementation.
 */
export async function downloadFile(file: FileRecord): Promise<void> {
  const raw = file.contentUrl;
  const url = raw ? resolveSafeFileUrl(raw) : undefined;
  if (!url) throw new Error('File URL is not allowed.');
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  link.click();
}
