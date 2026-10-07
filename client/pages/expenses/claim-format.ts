/**
 * Small formatting helpers shared by the expense pages.
 *
 * They take the locale rather than calling a hook, so they can be used inside `useMemo` and in plain functions.
 */

/** Two decimal places, which is what the amount columns store. */
export function formatAmount(value: number): string {
  return value.toFixed(2);
}

/** A full date and time in the current language, or `undefined` when there is nothing to show. */
export function formatDateTime(
  value: string | null | undefined,
  locale: string,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** A calendar day in the current language. */
export function formatDay(
  value: string | null | undefined,
  locale: string,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

/**
 * `YYYY-MM-DD` to a `Date`, built from local parts so the calendar day never shifts with the timezone.
 */
export function parseDay(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) {
    return undefined;
  }
  return new Date(year, month - 1, day);
}

/** A `Date` back to `YYYY-MM-DD`, using local parts for the same reason. */
export function toDayString(value: Date | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const year = `${value.getFullYear()}`.padStart(4, '0');
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A `YYYY-MM` bucket key as a month name in the current language. */
export function formatMonth(value: string, locale: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
  }).format(new Date(year, month - 1, 1));
}

/** Bytes as a short human-readable size, for the export result. */
export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const scaled = value / 1024 ** exponent;
  return `${scaled >= 10 || exponent === 0 ? Math.round(scaled) : scaled.toFixed(1)} ${units[exponent]}`;
}
