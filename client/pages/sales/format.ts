/**
 * A plain, locale-aware number for an expected amount: grouping and up to two
 * decimals, without assuming which currency the business works in.
 */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

/** A date as the short local form, used in table cells. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(date);
}
