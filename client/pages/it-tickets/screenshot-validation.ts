/**
 * Upload validation runs before the file leaves the browser: the file picker's
 * `accept` attribute is a hint, and the native control still lets someone
 * choose a renamed or damaged file. The server repeats the byte check when the
 * ticket is submitted, but rejecting here keeps an unusable file out of the
 * unclaimed uploads and tells the person what is wrong immediately.
 */
export const SCREENSHOT_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp';

type ScreenshotFormat = 'png' | 'jpeg' | 'gif' | 'webp';

const EXTENSIONS: Record<ScreenshotFormat, readonly string[]> = {
  png: ['png'],
  jpeg: ['jpg', 'jpeg'],
  gif: ['gif'],
  webp: ['webp'],
};

const MIME_TYPES: Record<ScreenshotFormat, readonly string[]> = {
  png: ['image/png'],
  jpeg: ['image/jpeg', 'image/jpg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
};

export type ScreenshotProblem = 'type' | 'corrupt';

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      (bytes[offset + 1] ?? 0) * 0x10000 +
      (bytes[offset + 2] ?? 0) * 0x100 +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) +
      (bytes[offset + 1] ?? 0) * 0x100 +
      (bytes[offset + 2] ?? 0) * 0x10000 +
      (bytes[offset + 3] ?? 0) * 0x1000000) >>>
    0
  );
}

function isCompletePng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!startsWith(bytes, signature)) return false;

  let offset = signature.length;
  let first = true;
  let imageData = false;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    if (first) {
      if (type !== 'IHDR' || length !== 13) return false;
      first = false;
    }
    if (type === 'IDAT' && length > 0) imageData = true;
    if (type === 'IEND') {
      return length === 0 && end === bytes.length && imageData;
    }
    offset = end;
  }
  return false;
}

function isCompleteJpeg(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0xff, 0xd8, 0xff]) &&
    bytes.length >= 4 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

function isCompleteGif(bytes: Uint8Array): boolean {
  return (
    (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') &&
    bytes.length > 13 &&
    bytes[bytes.length - 1] === 0x3b
  );
}

function isCompleteWebp(bytes: Uint8Array): boolean {
  return (
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP' &&
    bytes.length >= 12 &&
    readUint32LE(bytes, 4) + 8 === bytes.length
  );
}

function detectFormat(bytes: Uint8Array): ScreenshotFormat | null {
  if (isCompletePng(bytes)) return 'png';
  if (isCompleteJpeg(bytes)) return 'jpeg';
  if (isCompleteGif(bytes)) return 'gif';
  if (isCompleteWebp(bytes)) return 'webp';
  return null;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Browsers refuse a structurally valid-looking file that cannot actually be decoded. */
async function decodes(file: File): Promise<boolean> {
  if (typeof createImageBitmap !== 'function') return true;
  try {
    const bitmap = await createImageBitmap(file);
    const valid = bitmap.width > 0 && bitmap.height > 0;
    bitmap.close?.();
    return valid;
  } catch {
    return false;
  }
}

export async function inspectScreenshot(
  file: File,
): Promise<ScreenshotProblem | null> {
  const ext = extensionOf(file.name);
  const mime = file.type.toLowerCase();
  if (
    !Object.values(EXTENSIONS).some((extensions) => extensions.includes(ext))
  ) {
    return 'type';
  }
  if (mime && !mime.startsWith('image/')) return 'type';

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return 'corrupt';
  }
  const format = detectFormat(bytes);
  if (!format) return 'corrupt';
  if (!EXTENSIONS[format].includes(ext)) return 'corrupt';
  if (mime && !MIME_TYPES[format].includes(mime)) return 'corrupt';
  return (await decodes(file)) ? null : 'corrupt';
}
