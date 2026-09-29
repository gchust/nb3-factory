/** A date-only formatter that survives a null or unparseable value. */
export function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

/**
 * A currency amount. The application stores expected amounts as plain numbers,
 * so one currency is used consistently; the figure is what matters here.
 */
export function formatAmount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}
