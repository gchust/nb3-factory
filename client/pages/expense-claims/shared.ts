/** Shared formatting helpers for the expense claims pages. */

/** Best-effort server error message from an ApiClientError payload. */
export function errorMessage(cause: unknown, fallback: string): string {
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'payload' in cause &&
    typeof (cause as { payload?: { message?: unknown } }).payload?.message ===
      'string'
  ) {
    const message = (cause as { payload: { message: string } }).payload.message;
    if (message) return message;
  }
  return fallback;
}

const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
});

export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return moneyFormatter.format(value);
}

export function formatDate(value: Date | string | number): string {
  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value)) return value;
  // The server transports datetime columns as epoch-millisecond strings
  // (e.g. "1789225870446.0"); render them as real dates instead of raw.
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN;
  if (Number.isFinite(parsed)) {
    value = new Date(parsed);
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return typeof value === 'string' ? value : '—';
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Status badge styling using semantic theme tokens so it adapts to both light
 * and dark themes.
 */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'approved':
      return 'bg-primary/15 text-primary';
    case 'rejected':
      return 'bg-destructive/15 text-destructive';
    case 'pending':
      return 'bg-secondary text-secondary-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
