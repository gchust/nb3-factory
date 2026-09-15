import type { DocumentCapabilities } from './types.js';
import { formatBytes } from './types.js';

export interface TranslatedMessage {
  readonly key: string;
  readonly options?: Record<string, unknown>;
}

/**
 * Maps a server error code to an application translation key. Kept as a key rather than a string so the caller
 * translates in its own namespace and the message stays bilingual.
 */
export function errorDescriptor(
  code: string | undefined,
  capabilities: DocumentCapabilities,
): TranslatedMessage {
  const options = {
    maxFiles: capabilities.limits.maxFiles,
    maxFileSize: formatBytes(capabilities.limits.maxFileBytes),
    maxBatchSize: formatBytes(capabilities.limits.maxBatchBytes),
  };
  switch (code) {
    case 'TOO_MANY_FILES':
      return { key: 'documents.errors.TOO_MANY_FILES', options };
    case 'UNSUPPORTED_TYPE':
      return { key: 'documents.errors.UNSUPPORTED_TYPE', options };
    case 'FILE_TOO_LARGE':
      return { key: 'documents.errors.FILE_TOO_LARGE', options };
    case 'BATCH_TOO_LARGE':
      return { key: 'documents.errors.BATCH_TOO_LARGE', options };
    case 'NO_FILES':
      return { key: 'documents.errors.NO_FILES', options };
    case 'INVALID_DISCIPLINE':
      return { key: 'documents.errors.INVALID_DISCIPLINE', options };
    case 'INVALID_VERSION':
      return { key: 'documents.errors.INVALID_VERSION', options };
    case 'INVALID_STATUS':
      return { key: 'documents.errors.INVALID_STATUS', options };
    case 'FORBIDDEN':
      return { key: 'documents.errors.FORBIDDEN', options };
    case 'NOT_FOUND':
      return { key: 'documents.errors.NOT_FOUND', options };
    default:
      return { key: 'documents.errors.generic', options };
  }
}

export type SelectionValidation =
  { readonly ok: true } | { readonly ok: false; readonly code: string };

/**
 * The client-side half of the upload rules. The server enforces the same limits; this only makes the refusal
 * immediate, which is what the acceptance flow expects before any byte is sent.
 */
export function validateSelection(
  files: readonly File[],
  capabilities: DocumentCapabilities,
): SelectionValidation {
  if (files.length === 0) return { ok: false, code: 'NO_FILES' };
  if (files.length > capabilities.limits.maxFiles) {
    return { ok: false, code: 'TOO_MANY_FILES' };
  }
  const allowed = new Set(
    capabilities.extensions.map((extension) => extension.toLowerCase()),
  );
  for (const file of files) {
    const dot = file.name.lastIndexOf('.');
    const extension = dot <= 0 ? '' : file.name.slice(dot + 1).toLowerCase();
    if (!allowed.has(extension)) return { ok: false, code: 'UNSUPPORTED_TYPE' };
    if (file.size > capabilities.limits.maxFileBytes) {
      return { ok: false, code: 'FILE_TOO_LARGE' };
    }
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > capabilities.limits.maxBatchBytes) {
    return { ok: false, code: 'BATCH_TOO_LARGE' };
  }
  return { ok: true };
}
