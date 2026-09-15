// The upload allowlist. This is the single source of truth for which files the media library
// accepts; the client repeats the list and the size cap only as a convenience, the server is
// what decides. Anything not listed here — HTML, SVG, XML, archives, executables — is rejected.
export const MEDIA_TYPES = ['image', 'audio', 'video', 'document'] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

/** Largest single upload the media library accepts. */
export const MAX_UPLOAD_BYTES: number = 10 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'mp3',
  'wav',
  'mp4',
  'webm',
  'pdf',
  'txt',
  'md',
] as const;

const EXTENSION_TYPES: Readonly<Record<string, MediaType>> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  mp3: 'audio',
  wav: 'audio',
  mp4: 'video',
  webm: 'video',
  pdf: 'document',
  txt: 'document',
  md: 'document',
};

// Even when a filename carries an allowed extension, an active markup content type is refused:
// a `.png` announced as `text/html` must not be stored as an image.
const BLOCKED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
  'text/html',
  'text/xml',
]);

export type MediaClassification =
  | { readonly ok: true; readonly type: MediaType; readonly ext: string }
  | {
      readonly ok: false;
      readonly code: 'TYPE_NOT_ALLOWED' | 'MIME_NOT_ALLOWED';
    };

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot + 1).toLowerCase();
}

// Browsers are inconsistent about the declared type of text and Markdown files, and an empty type
// becomes `application/octet-stream`. The stored type is taken from the extension instead so the
// preview and the content response always agree with the file the user chose.
const CANONICAL_MIME_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
};

export function canonicalMimeType(ext: string): string {
  return CANONICAL_MIME_TYPES[ext] ?? 'application/octet-stream';
}

export function classifyMediaFile(
  filename: string,
  mimeType: string,
): MediaClassification {
  const ext = fileExtension(filename);
  const type = EXTENSION_TYPES[ext];
  if (!type) return { ok: false, code: 'TYPE_NOT_ALLOWED' };
  const normalizedMime = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (BLOCKED_MIME_TYPES.has(normalizedMime)) {
    return { ok: false, code: 'MIME_NOT_ALLOWED' };
  }
  return { ok: true, type, ext };
}

export function isMediaType(value: unknown): value is MediaType {
  return (
    typeof value === 'string' &&
    (MEDIA_TYPES as readonly string[]).includes(value)
  );
}

export function isAssetStatus(value: unknown): value is AssetStatus {
  return value === 'available' || value === 'disabled';
}

export type AssetStatus = 'available' | 'disabled';

/**
 * Tags are stored as a canonical `,one,two,` string so that one tag can be selected exactly with
 * `LIKE '%,tag,%'` instead of matching a substring of a longer tag. The client sends either a
 * delimited string or an array; both are normalised here.
 */
export function normalizeTags(input: unknown): string | null {
  const raw = Array.isArray(input)
    ? input.map((value) => String(value))
    : typeof input === 'string'
      ? input.split(',')
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const candidate of raw) {
    const tag = candidate.replace(/\s+/gu, ' ').trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.length ? `,${tags.join(',')},` : null;
}

export function tagsFromStored(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function normalizeSize(value: unknown): number {
  const size =
    typeof value === 'number'
      ? value
      : typeof value === 'bigint'
        ? Number(value)
        : typeof value === 'string' && /^\d+$/.test(value)
          ? Number(value)
          : NaN;
  return Number.isSafeInteger(size) && size >= 0 ? size : 0;
}
