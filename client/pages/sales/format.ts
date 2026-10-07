/**
 * Format an amount for reading.
 *
 * Amounts are plain numbers in the application: the seeds and the forms carry no currency, so none is invented here.
 * Decimals follow the current language, and a record with no amount shows as an em dash.
 */
export function formatAmount(value: number | null, locale: string): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
