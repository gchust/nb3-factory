/**
 * Content checks for a ticket attachment. The browser's `accept` filter and `File.type` both trust the file name,
 * so a `.png` full of random bytes passes them and would be stored as a screenshot. The raise form reads the first
 * bytes and rejects a file whose signature does not match the type it claims, with a message the person can act on.
 */

export type AttachmentProblem = {
  readonly key: string;
  readonly filename: string;
} | null;

type FileKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'pdf' | 'zip';

const SIGNATURE_LENGTH = 16;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function kindOf(file: File): FileKind | null {
  const ext = extensionOf(file.name);
  const type = file.type.toLowerCase();
  if (ext === 'png' || type === 'image/png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg' || type === 'image/jpeg') return 'jpeg';
  if (ext === 'gif' || type === 'image/gif') return 'gif';
  if (ext === 'webp' || type === 'image/webp') return 'webp';
  if (ext === 'bmp' || type === 'image/bmp') return 'bmp';
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || ext === 'xlsx' || ext === 'zip') return 'zip';
  // `text/plain`, `.log` and anything else the form accepts has no reliable binary signature, so it is left alone.
  return null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  return [...text].every(
    (char, index) => bytes[offset + index] === char.charCodeAt(0),
  );
}

function matches(kind: FileKind, bytes: Uint8Array): boolean {
  switch (kind) {
    case 'png':
      return startsWith(
        bytes,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    case 'jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'gif':
      return asciiAt(bytes, 0, 'GIF8');
    case 'webp':
      return asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP');
    case 'bmp':
      return asciiAt(bytes, 0, 'BM');
    case 'pdf':
      return asciiAt(bytes, 0, '%PDF');
    case 'zip':
      return startsWith(bytes, [0x50, 0x4b]);
  }
}

export async function inspectAttachment(
  file: File,
): Promise<AttachmentProblem> {
  const kind = kindOf(file);
  if (!kind) return null;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, SIGNATURE_LENGTH).arrayBuffer());
  } catch {
    return {
      key: 'serviceDesk.form.attachmentUnreadable',
      filename: file.name,
    };
  }
  if (matches(kind, bytes)) return null;
  return {
    key: 'serviceDesk.form.attachmentContentMismatch',
    filename: file.name,
  };
}
