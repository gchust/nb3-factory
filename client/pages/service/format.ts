/**
 * Presentational constants and formatters shared by the service pages.
 *
 * They live beside the shared components but in their own module so the
 * component file exports only components and keeps fast refresh working.
 */

/** The work-order lifecycle, in the order the supervisor walks it. */
export const ORDER_STATUSES = [
  'pending_accept',
  'pending_process',
  'processing',
  'pending_confirm',
  'closed',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number] | 'rejected';

export const ORDER_PRIORITIES = ['normal', 'urgent'] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    date,
  );
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
