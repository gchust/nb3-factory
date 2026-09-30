import type { FileRecord } from '@nocobase/app-plugin-file/client';

import {
  fileExtension,
  resolveFilePreviewKind,
} from '@/extensions/nocobase-file-component-ui/lib/file-preview.js';

import type { ServiceAttachment } from '../types.js';

/**
 * Build the file record the shared preview components expect. The attachment
 * table already carries everything they read except the storage coordinates,
 * which a preview never touches: the bytes are handed over as an object URL.
 */
export function toFileRecord(attachment: ServiceAttachment): FileRecord {
  return {
    id: attachment.id,
    disk: '',
    key: '',
    filename: attachment.filename,
    ext: fileExtension(attachment.filename).replace(/^\./u, ''),
    mimeType: attachment.mimeType,
    size: String(attachment.size),
    createdAt: attachment.createdAt,
    updatedAt: attachment.createdAt,
  };
}

/**
 * Whether this attachment has an in-app preview at all. PNG images and Word
 * documents render in the dialog; everything else is download-only.
 */
export function canPreviewAttachment(attachment: ServiceAttachment): boolean {
  const kind = resolveFilePreviewKind(toFileRecord(attachment));
  return kind === 'image' || kind === 'ooxml' || kind === 'markdown';
}
