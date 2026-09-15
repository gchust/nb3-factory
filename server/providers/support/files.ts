import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
} from './constants.js';

export interface FileValidationInput {
  readonly filename: string;
  readonly size: number;
  readonly mimeType?: string | undefined;
}

export type FileValidationResult =
  | { readonly ok: true; readonly extension: string }
  | {
      readonly ok: false;
      readonly code:
        'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE' | 'INVALID_FILE';
      readonly message: string;
    };

/** The lower-case extension of a filename, or an empty string when it has none. */
export function fileExtension(filename: string): string {
  const normalized = filename.trim();
  const dot = normalized.lastIndexOf('.');
  if (dot <= 0 || dot === normalized.length - 1) return '';
  return normalized.slice(dot + 1).toLowerCase();
}

/**
 * The single place that decides whether a local file may be attached. The
 * client mirrors these rules for immediate feedback, but this function is the
 * authority because only the server sees the real bytes.
 */
export function validateAttachmentFile(
  input: FileValidationInput,
): FileValidationResult {
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    return {
      ok: false,
      code: 'INVALID_FILE',
      message: 'The uploaded file is empty.',
    };
  }
  if (input.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `The file exceeds the ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB single-file limit.`,
    };
  }
  const extension = fileExtension(input.filename);
  if (
    !extension ||
    !(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(extension)
  ) {
    return {
      ok: false,
      code: 'UNSUPPORTED_FILE_TYPE',
      message: extension
        ? `Files with the .${extension} extension are not allowed.`
        : 'The file must have a recognised extension.',
    };
  }
  return { ok: true, extension };
}
