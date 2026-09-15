/**
 * The document library's server-side policy: what may be uploaded, how large a batch may be, and how a stored
 * record maps to a content URL. Kept free of Hono and database access so the rules can be unit tested directly and
 * shared by every route that needs them.
 */

export const DOCUMENT_COLLECTION = 'documents';
export const DOCUMENT_DISK = 'local';
export const DOCUMENT_ACCESS_PATH = '/uploads/documents';
export const DOCUMENT_RESOURCE: {
  readonly type: string;
  readonly id: string;
} = {
  type: 'database.collection',
  id: `main.${DOCUMENT_COLLECTION}`,
};

export const DISCIPLINES = [
  'architecture',
  'structure',
  'mechanical-electrical',
  'hvac',
] as const;

export const STATUSES = ['active', 'obsolete'] as const;

/** The only file types a data clerk may upload. */
export const ALLOWED_EXTENSIONS = [
  'pdf',
  'dwg',
  'docx',
  'xlsx',
  'png',
] as const;

/** One file may not exceed this; a rejected file is never written. */
export const MAX_FILE_BYTES: number = 10 * 1024 * 1024;
/** The whole selection in one upload operation may not exceed this. */
export const MAX_BATCH_BYTES: number = 25 * 1024 * 1024;
/** How many files one upload operation may register at once. */
export const MAX_FILES: number = 5;

/** MIME types offered to the browser for the whitelisted extensions. */
export const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  dwg: 'image/vnd.dwg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
};

export type Discipline = (typeof DISCIPLINES)[number];
export type DocumentStatus = (typeof STATUSES)[number];

export interface UploadSelectionFile {
  readonly name: string;
  readonly size: number;
}

export interface UploadSelection {
  readonly discipline: string;
  readonly version?: string;
  readonly files: readonly UploadSelectionFile[];
}

export interface NormalizedUpload {
  readonly discipline: Discipline;
  readonly version: string;
}

export type UploadValidation =
  | { readonly ok: true; readonly value: NormalizedUpload }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly details?: Record<string, unknown>;
    };

export function normalizeExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export function isAllowedExtension(extension: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension);
}

export function isDiscipline(value: unknown): value is Discipline {
  return (
    typeof value === 'string' &&
    (DISCIPLINES as readonly string[]).includes(value)
  );
}

export function isStatus(value: unknown): value is DocumentStatus {
  return (
    typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Applies every limit and the type whitelist before a single byte is stored, so a rejected batch leaves the
 * ledger unchanged and the caller gets a specific, translatable reason.
 */
export function validateUploadSelection(
  selection: UploadSelection,
): UploadValidation {
  if (!isDiscipline(selection.discipline)) {
    return {
      ok: false,
      code: 'INVALID_DISCIPLINE',
      message: 'A valid discipline is required.',
    };
  }

  const version = (selection.version ?? '').trim() || '1.0';
  if (version.length > 32) {
    return {
      ok: false,
      code: 'INVALID_VERSION',
      message: 'The version must be 32 characters or fewer.',
    };
  }

  const files = selection.files;
  if (files.length === 0) {
    return {
      ok: false,
      code: 'NO_FILES',
      message: 'Choose at least one file.',
    };
  }
  if (files.length > MAX_FILES) {
    return {
      ok: false,
      code: 'TOO_MANY_FILES',
      message: `A single upload may contain at most ${MAX_FILES} files.`,
      details: { maxFiles: MAX_FILES, count: files.length },
    };
  }

  let total = 0;
  for (const file of files) {
    const extension = normalizeExtension(file.name);
    if (!isAllowedExtension(extension)) {
      return {
        ok: false,
        code: 'UNSUPPORTED_TYPE',
        message: `Only ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()} files are allowed.`,
        details: { filename: file.name, extension },
      };
    }
    if (file.size > MAX_FILE_BYTES) {
      return {
        ok: false,
        code: 'FILE_TOO_LARGE',
        message: `A single file may not exceed ${MAX_FILE_BYTES} bytes.`,
        details: {
          filename: file.name,
          maxFileBytes: MAX_FILE_BYTES,
          size: file.size,
        },
      };
    }
    total += file.size;
  }

  if (total > MAX_BATCH_BYTES) {
    return {
      ok: false,
      code: 'BATCH_TOO_LARGE',
      message: `A single upload may not exceed ${MAX_BATCH_BYTES} bytes in total.`,
      details: { maxBatchBytes: MAX_BATCH_BYTES, total },
    };
  }

  return { ok: true, value: { discipline: selection.discipline, version } };
}

export function contentUrl(
  publicBasePath: string,
  record: { readonly id: string; readonly ext: string },
): string {
  const base = publicBasePath.replace(/\/$/, '');
  const suffix = record.ext ? `.${record.ext}` : '';
  return `${base}${DOCUMENT_ACCESS_PATH}/${record.id}${suffix}`;
}

const CONTENT_FILE_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/;

export function parseContentFileParam(
  value: string,
): { readonly id: string; readonly ext: string } | undefined {
  const match = CONTENT_FILE_PATTERN.exec(value);
  if (!match) return undefined;
  return { id: match[1], ext: match[2] ?? '' };
}

/** A display name derived from the uploaded file name, without its extension. */
export function nameFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const trimmed = base.trim() || filename;
  return trimmed.slice(0, 255);
}
