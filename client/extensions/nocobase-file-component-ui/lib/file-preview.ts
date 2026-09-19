// Materialized from @nocobase/app-plugin-file registry item `component-ui`
// (client/extensions/nocobase-file-component-ui). Application-owned source.
//
// Difference from the published copy: the OOXML (@silurus/ooxml) and Office
// Online branches were removed. This application does not install the OOXML
// viewer and Office Online cannot use the application session, so those formats
// are reported as `unsupported` and offered as a download instead of rendering
// an empty frame.

import type { FileRecord } from '@nocobase/app-plugin-file/client';

export type FilePreviewKind =
  'image' | 'pdf' | 'audio' | 'video' | 'text' | 'markdown' | 'unsupported';

const ACTIVE_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
  'text/html',
  'text/xml',
]);
const ACTIVE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.htm',
  '.html',
  '.svg',
  '.xhtml',
  '.xml',
]);

/** Formats that only the removed OOXML/Office Online viewers could render. */
const BINARY_DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.doc',
  '.docx',
  '.odf',
  '.odg',
  '.odm',
  '.odp',
  '.ods',
  '.odt',
  '.otg',
  '.oth',
  '.otp',
  '.ots',
  '.ott',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
]);

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

export function isSafeImagePreview(file: FileRecord): boolean {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return (
    mimeType.startsWith('image/') &&
    mimeType !== 'image/svg+xml' &&
    !ACTIVE_EXTENSIONS.has(fileExtension(file.filename))
  );
}

export function resolveFilePreviewKind(file: FileRecord): FilePreviewKind {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const extension = fileExtension(file.filename);
  if (
    ACTIVE_MIME_TYPES.has(mimeType) ||
    mimeType.endsWith('+xml') ||
    ACTIVE_EXTENSIONS.has(extension) ||
    BINARY_DOCUMENT_EXTENSIONS.has(extension)
  ) {
    return 'unsupported';
  }
  if (mimeType === 'text/markdown' || extension === '.md') return 'markdown';
  if (isSafeImagePreview(file)) return 'image';
  if (mimeType === 'application/pdf' || extension === '.pdf') return 'pdf';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    extension === '.json'
  ) {
    return 'text';
  }
  return 'unsupported';
}
