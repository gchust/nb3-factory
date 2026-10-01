import { badRequest } from './errors.js';

/**
 * Attachment content validation for the two formats the service desk accepts:
 * on-site PNG photos and DOCX repair reports.
 *
 * A filename extension and the browser-supplied MIME type are claims, not
 * evidence: a truncated or corrupt file arrives with both. This checks the
 * bytes as well, so "the upload succeeded" means the stored object really is a
 * file of the accepted type instead of something the preview and download will
 * later fail to open.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Guards against reading an unreasonably large upload into memory to inspect it. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * A DOCX is a ZIP package whose entries include `[Content_Types].xml` and a
 * `word/` directory. Reading the entry names from the raw bytes distinguishes a
 * real DOCX from any other ZIP (or a corrupt one) without a ZIP library.
 */
function looksLikeDocxPackage(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes).toString('latin1');
  return text.includes('[Content_Types].xml') && text.includes('word/');
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

export async function assertAllowedAttachment(file: File): Promise<void> {
  if (file.size === 0) {
    throw badRequest('The file is empty');
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw badRequest('The file is too large to attach');
  }
  const extension = extensionOf(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (extension === 'png') {
    if (!startsWith(bytes, PNG_SIGNATURE)) {
      throw badRequest('The PNG file is damaged or is not a PNG image');
    }
    return;
  }

  if (extension === 'docx') {
    if (file.type !== '' && file.type !== DOCX_MIME) {
      throw badRequest('The DOCX file is damaged or is not a DOCX document');
    }
    if (!startsWith(bytes, ZIP_SIGNATURE) || !looksLikeDocxPackage(bytes)) {
      throw badRequest('The DOCX file is damaged or is not a DOCX document');
    }
    return;
  }

  throw badRequest('Only PNG photos and DOCX repair reports can be attached');
}
