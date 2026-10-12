/**
 * The content checks the screenshot field runs before an upload starts.
 *
 * The browser picks a file's mime type from its extension, so `accept="image/*"` lets a text file named `shot.png`
 * through and the server, which stores whatever it is handed, would keep it. A screenshot field therefore has to
 * look inside the bytes: the signature says whether the file is the image it claims to be, and decoding it says
 * whether the image is intact.
 */

const SIGNATURES: readonly {
  readonly offset: number;
  readonly bytes: readonly number[];
}[] = [
  // PNG
  { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // JPEG
  { offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // GIF87a / GIF89a
  { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  // BMP
  { offset: 0, bytes: [0x42, 0x4d] },
  // WEBP: "RIFF" ... "WEBP"
  { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
];

const WEBP_BRAND = [0x57, 0x45, 0x42, 0x50];

function startsWith(
  header: Uint8Array,
  offset: number,
  bytes: readonly number[],
): boolean {
  if (header.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => header[offset + index] === byte);
}

/**
 * Whether the first bytes carry a known raster image signature. A valid image cannot start with anything else, so a
 * file that fails here is rejected without decoding it.
 */
export function hasImageSignature(header: Uint8Array): boolean {
  if (
    !SIGNATURES.some((signature) =>
      startsWith(header, signature.offset, signature.bytes),
    )
  ) {
    return false;
  }
  // RIFF alone is also AVI and WAV; require the WEBP form for the image case.
  if (
    startsWith(header, 0, [0x52, 0x49, 0x46, 0x46]) &&
    !startsWith(header, 8, WEBP_BRAND)
  ) {
    return false;
  }
  return true;
}

/**
 * Whether the browser can decode the file as an image. A file with the right signature but broken or truncated
 * content fails here. When the platform exposes no decoder the signature is the only evidence available, so the file
 * is accepted rather than rejecting every image on a browser that cannot check.
 */
export async function isDecodableImage(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!hasImageSignature(header)) return false;
  if (typeof createImageBitmap !== 'function') return true;
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}
