export interface FileSizeUnits {
  readonly b: string;
  readonly kb: string;
  readonly mb: string;
  readonly gb: string;
}

/** Builds the unit labels from translation keys so sizes are localized. */
export function fileSizeUnits(t: (key: string) => string): FileSizeUnits {
  return {
    b: t('files.units.b'),
    kb: t('files.units.kb'),
    mb: t('files.units.mb'),
    gb: t('files.units.gb'),
  };
}

/** Human-readable byte size. Units are passed in so the value is translatable. */
export function formatFileSize(bytes: number, units: FileSizeUnits): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${units.b}`;
  if (bytes < 1024) return `${Math.round(bytes)} ${units.b}`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${formatNumber(kilobytes)} ${units.kb}`;

  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${formatNumber(megabytes)} ${units.mb}`;

  return `${formatNumber(megabytes / 1024)} ${units.gb}`;
}

function formatNumber(value: number): string {
  return value >= 100 || Number.isInteger(value)
    ? value.toFixed(0)
    : value.toFixed(1);
}

/** Raster images preview inline; SVG and everything else fall back to an icon. */
export function isImageFile(file: {
  readonly mimeType: string;
  readonly ext?: string;
}): boolean {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return (
    mimeType.startsWith('image/') &&
    mimeType !== 'image/svg+xml' &&
    (file.ext ?? '').toLowerCase() !== 'svg'
  );
}

/** Only same-origin or absolute http(s) URLs are allowed to render or download. */
export function resolveFileUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
