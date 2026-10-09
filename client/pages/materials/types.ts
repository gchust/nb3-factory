import type { FileRecord } from '@nocobase/app-plugin-file/client';

/**
 * One attachment as the material endpoints return it.
 *
 * The server deliberately leaves out the storage `key` and `disk` the file plugin's own records carry; the browser
 * reads only the fields below, which are enough to show, preview, download and reload an attachment. `contentUrl`
 * already carries the application base path, so it is usable in an `img` or an `a` as it is.
 */
export interface MaterialFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contentUrl: string;
}

/** A material and the attachments currently linked to it. */
export interface Material {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly MaterialFile[];
}

export interface MaterialListMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

/** What the list page hands to the child routes it opens: a save refreshes the list behind them. */
export interface MaterialsOutletContext {
  readonly reload: () => void;
}

/**
 * A material's attachment as the read-only file components want it. They accept `FileRecord`, whose storage fields
 * nothing in the browser reads; a `MaterialFile` supplies all the rest.
 */
export function toFileRecord(file: MaterialFile): FileRecord {
  return {
    id: file.id,
    disk: '',
    key: '',
    filename: file.filename,
    ext: file.ext,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    contentUrl: file.contentUrl,
  };
}

/** The formats this first version accepts, for the picker. The server checks the extension again on save. */
export const MATERIAL_FILE_ACCEPT = ['image/png', '.docx'] as const;

/** The largest attachment the file endpoint and the picker allow, in bytes. */
export const MATERIAL_FILE_MAX_SIZE = 8 * 1024 * 1024;
