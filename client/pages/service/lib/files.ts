import { resolveAppUrl } from '@nocobase/app-client';

import type { FileRecord } from '../../../extensions/nocobase-file-component-ui/index.js';
import type { ServiceFile } from './types.js';

/** The application-owned, session- and record-scoped URL for a stored file. */
export function fileContentUrl(id: string): string {
  return resolveAppUrl(`api/service/files/${encodeURIComponent(id)}/content`);
}

/**
 * The server returns stored file rows without a URL; the file components need
 * one. It is built here rather than reusing the repository's public byte URL,
 * which is deliberately not mounted.
 */
export function decorateFiles(
  files: readonly ServiceFile[],
): readonly FileRecord[] {
  return files.map((file) => ({
    ...file,
    ext: file.ext ?? '',
    mimeType: file.mimeType ?? '',
    size: file.size ?? 0,
    contentUrl: fileContentUrl(file.id),
  }));
}
