import type { FileRecord } from '@nocobase/app-plugin-file/client';
import type { LabFileView } from './lab-types.js';

/**
 * Maps a laboratory attachment onto the file record the file component's helpers expect.
 *
 * The bytes live in this application's own table rather than in the file plugin's, so the record is
 * synthesized from the fields the helpers read. `key` and `disk` are carried because the helpers
 * treat them as identity, and `updatedAt` mirrors `createdAt`: an attachment is uploaded once.
 */
export function toFileRecord(file: LabFileView): FileRecord {
  const createdAt = file.createdAt ?? new Date(0).toISOString();
  return {
    id: file.id,
    disk: 'database',
    key: file.id,
    filename: file.filename,
    ext: file.ext ?? '',
    mimeType: file.mimeType,
    size: file.size,
    createdAt,
    updatedAt: createdAt,
    contentUrl: file.contentUrl,
  };
}

/** `1.2 MB` — a size a person can compare at a glance. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** `before_repair` -> `beforeRepair`, the suffix its label key uses. */
export function purposeKey(purpose: string): string {
  return purpose.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}
