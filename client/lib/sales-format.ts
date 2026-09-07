/** Formatting helpers for the sales pages. */

/** A datetime value as returned by the API: epoch milliseconds, or an ISO string. */
export type DateTimeValue = string | number | null | undefined;

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value)}%`;
}

export function formatDate(value: DateTimeValue): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatDateTime(value: DateTimeValue): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function isOverdue(value: DateTimeValue): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

/**
 * Converts a datetime value (epoch milliseconds or ISO string) to a
 * `YYYY-MM-DD` string for an `<input type="date">` value.
 */
export function toDateInputValue(value: DateTimeValue): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Converts a datetime value (epoch milliseconds or ISO string) to a
 * `YYYY-MM-DDTHH:mm` string for an `<input type="datetime-local">` value.
 */
export function toDateTimeInputValue(value: DateTimeValue): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}
