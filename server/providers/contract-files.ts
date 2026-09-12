/**
 * File admission rules shared by every upload entry of the contract archive.
 *
 * These are the authoritative gate: the client UI applies the same rules for
 * instant feedback, but the server re-checks every upload against these
 * constants, so a crafted request cannot bypass the PDF-only body rule, the
 * PDF/image/office attachment rule or the 5 MiB per-file limit.
 */

export const MAX_CONTRACT_FILE_SIZE: number = 5 * 1024 * 1024; // 5 MiB

/** The contract body accepts exactly one PDF. */
const BODY_MIME_TYPES: ReadonlySet<string> = new Set(['application/pdf']);
const BODY_EXTENSIONS: ReadonlySet<string> = new Set(['pdf']);

/** Attachments accept PDF, raster images and common office documents. */
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

/** Lowercased extension without the dot; '' when the name has none. */
export function fileExtensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** Whether a file satisfies the admission rule for its kind. */
export function isAllowedContractFile(
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

/** Whether a file exceeds the 5 MiB per-file limit. */
export function exceedsContractFileSize(file: ContractFileCandidate): boolean {
  return file.size > MAX_CONTRACT_FILE_SIZE;
}

export interface ContractFileViolation {
  readonly code: string;
  readonly message: string;
}

/** Returns the first violation for a file, or undefined when it is admitted. */
export function contractFileViolation(
  file: ContractFileCandidate,
  kind: ContractFileKind,
): ContractFileViolation | undefined {
  if (!isAllowedContractFile(file, kind)) {
    const label = kind === 'body' ? 'PDF' : 'PDF、图片或常见办公文档';
    return {
      code:
        kind === 'body'
          ? 'BODY_FILE_TYPE_NOT_ALLOWED'
          : 'ATTACHMENT_FILE_TYPE_NOT_ALLOWED',
      message:
        kind === 'body'
          ? `正文只允许 PDF 文件（.pdf），请重新选择。`
          : `附件仅支持 PDF、图片与常见办公文档（${label} 等），请重新选择。`,
    };
  }
  if (exceedsContractFileSize(file)) {
    return {
      code: 'CONTRACT_FILE_TOO_LARGE',
      message: `单个文件不能超过 5 MiB，当前文件 ${file.name} 超出限制。`,
    };
  }
  return undefined;
}
