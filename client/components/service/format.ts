/**
 * Presentation helpers shared by the service pages.
 *
 * They only read a value the API sent; nothing here decides a business rule.
 */

/** A date-time as the reader's locale shows it, or an em dash for an empty value. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

/** A date without a time; the API sends dates as `YYYY-MM-DD`. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

/** A byte count in the units a person reads. */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** The `yyyy-MM-dd` value a date input needs from an ISO string. */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}
