import type { FileAttachment } from './types.js';

export type PreviewKind = 'image' | 'pdf' | 'text' | 'unsupported';

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'avif',
]);
const TEXT_EXTENSIONS = new Set([
  'txt',
  'text',
  'md',
  'markdown',
  'csv',
  'json',
  'log',
]);

/**
 * Classifies a stored file by the preview the interface can actually render.
 *
 * SVG and XML are deliberately excluded: rendering them can execute script, so
 * they fall through to the download branch instead of an inline preview.
 */
export function previewKind(file: {
  readonly ext: string;
  readonly mimeType: string;
}): PreviewKind {
  const ext = file.ext.toLowerCase();
  const mime = file.mimeType.toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (
    IMAGE_EXTENSIONS.has(ext) ||
    (mime.startsWith('image/') && ext !== 'svg')
  ) {
    return 'image';
  }
  if (TEXT_EXTENSIONS.has(ext) || mime.startsWith('text/')) return 'text';
  return 'unsupported';
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Triggers a same-origin download of the stored bytes. */
export function downloadAttachment(file: FileAttachment): void {
  if (!file.contentUrl) return;
  const link = document.createElement('a');
  link.href = file.contentUrl;
  link.download = file.filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}
