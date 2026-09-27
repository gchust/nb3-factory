/**
 * Formats a number with the current language's grouping and the two decimals
 * the amount column is stored with. No currency symbol: the application has not
 * chosen one, and a plain grouped amount reads the same in both languages.
 */
export function formatNumber(
  locale: string | undefined,
  value: number,
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(
  locale: string | undefined,
  iso: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
