/**
 * Client-side mirror of the server admission rules in
 * `server/providers/contract-files.ts`.
 *
 * This gives the upload controls instant localized feedback. It is NOT the
 * authoritative gate — every upload is re-validated by the server, which is the
 * only place a crafted request can be stopped.
 */

import type { FileRecord } from '@nocobase/app-plugin-file/client';

/**
 * Normalizes the `data` payload returned by the single-file upload endpoints.
 *
 * The body endpoint answers with one record object while the attachment
 * endpoint answers with an array (it shares the multi-file action the
 * multi-file control calls), so a single attachment picked through `uploadOne`
 * arrives as `[record]`. Picking the first element here keeps an array from
 * ever reaching the thumbnail renderer, which previously crashed the whole
 * edit page with "Unable to load page" when it tried to read `mimeType` off
 * the array.
 */
export function pickSingleUploadRecord(
  data: FileRecord | readonly FileRecord[] | undefined,
): FileRecord {
  // TypeScript does not narrow the readonly-array member of the union here, so
  // both branches are cast explicitly before the truthiness guard.
  let record: FileRecord | undefined;
  if (Array.isArray(data)) {
    record = (data as readonly FileRecord[])[0];
  } else {
    record = data as FileRecord | undefined;
  }
  if (!record) {
    throw new Error('Upload response did not include a file record.');
  }
  return record;
}

export const MAX_CONTRACT_FILE_SIZE: number = 5 * 1024 * 1024; // 5 MiB

const BODY_MIME_TYPES: ReadonlySet<string> = new Set(['application/pdf']);
const BODY_EXTENSIONS: ReadonlySet<string> = new Set(['pdf']);

const ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
]);
const ATTACHMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'md',
]);

export type ContractFileKind = 'body' | 'attachment';

export interface ContractFileCandidate {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export interface ContractFileViolation {
  readonly code: string;
}

/** Lowercased extension without the dot; '' when the name has none. */
export function fileExtensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

function isAllowedContractFile(
  file: ContractFileCandidate,
  kind: ContractFileKind,
): boolean {
  const mimeTypes = kind === 'body' ? BODY_MIME_TYPES : ATTACHMENT_MIME_TYPES;
  const extensions = kind === 'body' ? BODY_EXTENSIONS : ATTACHMENT_EXTENSIONS;
  return (
    mimeTypes.has(file.type.trim().toLowerCase()) ||
    extensions.has(fileExtensionOf(file.name))
  );
}

/** Returns the first violation code, or undefined when the file is admitted. */
export function clientContractFileViolation(
  file: ContractFileCandidate,
  kind: ContractFileKind,
): ContractFileViolation | undefined {
  if (!isAllowedContractFile(file, kind)) {
    return {
      code:
        kind === 'body'
          ? 'BODY_FILE_TYPE_NOT_ALLOWED'
          : 'ATTACHMENT_FILE_TYPE_NOT_ALLOWED',
    };
  }
  if (file.size > MAX_CONTRACT_FILE_SIZE) {
    return { code: 'CONTRACT_FILE_TOO_LARGE' };
  }
  return undefined;
}

/** Extensions for the file picker `accept` attribute of each upload kind. */
export function contractFileAccept(kind: ContractFileKind): readonly string[] {
  if (kind === 'body') return [...BODY_EXTENSIONS].map((ext) => `.${ext}`);
  return [...ATTACHMENT_EXTENSIONS].map((ext) => `.${ext}`);
}
