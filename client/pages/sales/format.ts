/** Formats a number for the current language, with grouping and at most two decimals. */
export function formatAmount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formats a stored timestamp for the current language. */
export function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

/** The muted placeholder a list shows for a value that is not set (guideline T1.6). */
export const EMPTY_VALUE = '—';
