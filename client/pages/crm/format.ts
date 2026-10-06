/** Formatting helpers shared by the CRM pages. Kept out of component files so Fast Refresh stays intact. */

export function formatAmount(locale: string, amount: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** A record's wall-clock timestamp, as the server sends it. */
export function formatDate(locale: string, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

/** An empty optional value shows as an em dash (guideline T1.3). */
export function orDash(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : '—';
}
