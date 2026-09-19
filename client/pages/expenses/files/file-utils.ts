import type { ExpenseFileView } from '../api.js';

export type ExpensePreviewKind =
  'image' | 'pdf' | 'text' | 'markdown' | 'audio' | 'video' | 'unsupported';

const UNSUPPORTED_EXTENSIONS = new Set([
  '.svg',
  '.html',
  '.htm',
  '.xml',
  '.xhtml',
]);

/**
 * Only same-document object URLs we created and ordinary http(s) URLs are
 * allowed. Anything else (javascript:, data:, …) is rejected.
 */
export function resolveSafeFileUrl(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('blob:')) return trimmed;
  try {
    const resolved = new URL(trimmed, window.location.href);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? trimmed
      : undefined;
  } catch {
    return undefined;
  }
}

export function fileUrlCredentials(url: string): RequestCredentials {
  try {
    return new URL(url, window.location.href).origin === window.location.origin
      ? 'same-origin'
      : 'omit';
  } catch {
    return 'same-origin';
  }
}

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

/**
 * Active or executable content is refused even though the upload could store
 * it; a stored HTML or SVG file served from the application origin would be a
 * cross-site scripting vector. Documents and archives are deliberately not
 * listed here: they cannot be previewed, but they can still be uploaded and
 * downloaded.
 */
const BLOCKED_UPLOAD_EXTENSIONS: ReadonlySet<string> = new Set([
  '.apk',
  '.app',
  '.bash',
  '.bat',
  '.cjs',
  '.cmd',
  '.com',
  '.dll',
  '.dylib',
  '.exe',
  '.htm',
  '.html',
  '.jar',
  '.js',
  '.mjs',
  '.msi',
  '.ps1',
  '.scr',
  '.sh',
  '.so',
  '.svg',
  '.xhtml',
  '.xml',
]);

/**
 * Decides whether the picker's selection may be uploaded. The `rules` are the
 * `accept` patterns offered to the file input; a blocked extension always
 * loses, so a broad `text/*` rule cannot smuggle in a script.
 */
export function isUploadAllowed(
  file: { readonly name: string; readonly type: string },
  rules: readonly string[],
): boolean {
  if (BLOCKED_UPLOAD_EXTENSIONS.has(fileExtension(file.name))) return false;
  if (rules.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    const value = rule.trim().toLowerCase();
    if (value === '*' || value === '*/*') return true;
    if (value.endsWith('/*')) return type.startsWith(value.slice(0, -1));
    if (value.startsWith('.')) return name.endsWith(value);
    return type === value;
  });
}

export function resolvePreviewKind(file: ExpenseFileView): ExpensePreviewKind {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const extension = fileExtension(file.filename);
  if (UNSUPPORTED_EXTENSIONS.has(extension)) return 'unsupported';
  if (
    mimeType === 'image/svg+xml' ||
    mimeType === 'text/html' ||
    mimeType === 'application/xhtml+xml' ||
    mimeType.endsWith('+xml')
  ) {
    return 'unsupported';
  }
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf' || extension === '.pdf') return 'pdf';
  if (mimeType === 'text/markdown' || extension === '.md') return 'markdown';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    extension === '.json'
  ) {
    return 'text';
  }
  return 'unsupported';
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Minimum time an upload status row stays visible. Against a local server the
 * whole transfer finishes in a few milliseconds, so without a floor the
 * "uploading"/"processing" row flickers past: the user gets no feedback and the
 * upload state cannot be observed at all. A short floor makes the feedback real
 * without meaningfully slowing the upload.
 */
export const MIN_UPLOAD_FEEDBACK_MS = 800;

/**
 * Runs `run` and holds the caller for at least `minimumMs`, so a state that
 * would otherwise flash by stays on screen long enough to read. Used around the
 * upload call so the progress row is always perceptible.
 */
export async function withFeedbackFloor<T>(
  run: () => Promise<T>,
  minimumMs: number = MIN_UPLOAD_FEEDBACK_MS,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    const remaining = minimumMs - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, remaining);
      });
    }
  }
}

/** Triggers a browser download for the given content URL. */
export function downloadFile(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}
