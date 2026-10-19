/**
 * Screenshots are screenshots: the upload route only checks size, and the
 * browser-supplied MIME type is a claim. Before a file is bound to a ticket,
 * the stored bytes have to identify themselves as a supported raster image.
 *
 * This is deliberately a format check, not a malware scanner. It rejects the
 * common failure the service desk sees — a renamed text file or a truncated
 * image — without pretending to replace a real content inspection pipeline.
 */
export type ScreenshotFormat = 'png' | 'jpeg' | 'gif' | 'webp';

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

/** A PNG whose chunk chain is complete, carrying image data and ending in IEND. */
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

export function detectScreenshotFormat(
  bytes: Uint8Array,
): ScreenshotFormat | null {
  if (isCompletePng(bytes)) return 'png';
  if (isCompleteJpeg(bytes)) return 'jpeg';
  if (isCompleteGif(bytes)) return 'gif';
  if (isCompleteWebp(bytes)) return 'webp';
  return null;
}

/**
 * The reason a file cannot be stored as a ticket screenshot, or `null` when it
 * can. The extension and declared MIME type must agree with the bytes rather
 * than merely being on an allowlist: a text file named `.png` is a text file.
 */
export function screenshotContentProblem(input: {
  readonly bytes: Uint8Array;
  readonly ext: string;
  readonly mimeType: string;
}): string | null {
  const format = detectScreenshotFormat(input.bytes);
  if (!format) {
    return 'A screenshot is not a complete supported image (PNG, JPEG, GIF, or WebP)';
  }
  const ext = input.ext.replace(/^\./, '').toLowerCase();
  if (!EXTENSIONS[format].includes(ext)) {
    return 'The screenshot extension does not match its image content';
  }
  const mimeType = input.mimeType.toLowerCase();
  if (!MIME_TYPES[format].includes(mimeType)) {
    return 'The screenshot MIME type does not match its image content';
  }
  return null;
}
