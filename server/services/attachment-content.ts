/**
 * Content sniffing for ticket attachments.
 *
 * The upload route used to trust the browser-supplied file name and MIME type,
 * so a truncated or renamed file was accepted and later rendered as a broken
 * image. These helpers read the leading bytes instead and reject a file whose
 * content does not match the attachment kind the caller declared.
 */

export type SniffedContent = 'png' | 'jpeg' | 'zip' | 'ole' | 'pdf' | 'unknown';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

/** The container format the leading bytes actually are. */
export function sniffAttachmentContent(bytes: Uint8Array): SniffedContent {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44) {
    return 'pdf';
  }
  // ZIP local file header; DOCX/XLSX/PPTX are ZIP containers.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
  // OLE compound file header; legacy DOC/XLS/PPT use it.
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  ) {
    return 'ole';
  }
  return 'unknown';
}

export interface AttachmentContentProblem {
  readonly code: string;
  readonly message: string;
}

/**
 * Reject content that contradicts the declared attachment kind.
 *
 * `photo` must be a real PNG or JPEG; `report` must be an Office container
 * (a DOCX ZIP or a legacy OLE document). Anything else — including `other`
 * and an undeclared kind — is left to the repository, which only limits size.
 */
export function validateAttachmentContent(
  bytes: Uint8Array,
  kind: string | undefined,
): AttachmentContentProblem | undefined {
  const content = sniffAttachmentContent(bytes);
  if (kind === 'photo' && content !== 'png' && content !== 'jpeg') {
    return {
      code: 'INVALID_ATTACHMENT',
      message: 'The selected file is not a valid PNG or JPEG image.',
    };
  }
  if (kind === 'report' && content !== 'zip' && content !== 'ole') {
    return {
      code: 'INVALID_ATTACHMENT',
      message: 'The selected file is not a valid Office document.',
    };
  }
  return undefined;
}
