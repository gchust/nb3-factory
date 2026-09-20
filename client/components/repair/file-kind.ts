export type FilePreviewKind = 'image' | 'pdf' | 'text' | 'unsupported';

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.avif',
]);

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.csv',
  '.md',
  '.log',
  '.json',
  '.tsv',
]);

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

export function hasExtension(
  filename: string,
  extensions: readonly string[],
): boolean {
  return extensions.includes(fileExtension(filename));
}

/**
 * What the preview dialog can render inline.
 *
 * Images are limited to raster formats: SVG would let an uploaded file run script in the page.
 */
export function resolvePreviewKind(file: {
  readonly filename: string;
  readonly mimeType: string;
}): FilePreviewKind {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const extension = fileExtension(file.filename);
  if (IMAGE_EXTENSIONS.has(extension) && mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType === 'application/pdf' || extension === '.pdf') return 'pdf';
  if (TEXT_EXTENSIONS.has(extension) || mimeType.startsWith('text/')) {
    return 'text';
  }
  return 'unsupported';
}

/** Long text previews are cut off so a huge file cannot stall the dialog. */
export const TEXT_PREVIEW_LIMIT = 20000;

export function truncateText(value: string): {
  readonly text: string;
  readonly truncated: boolean;
} {
  if (value.length <= TEXT_PREVIEW_LIMIT) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, TEXT_PREVIEW_LIMIT), truncated: true };
}
