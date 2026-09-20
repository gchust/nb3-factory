/** Money is transported as integer minor units, so display formatting is explicit. */
export function formatMoney(
  cents: number | string | null | undefined,
  currency = 'CNY',
): string {
  const value = typeof cents === 'string' ? Number(cents) : (cents ?? 0);
  const amount = Number.isFinite(value) ? value / 100 : 0;
  return `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Parse a user-entered major-unit amount into integer minor units. */
export function parseAmountToCents(input: string): number {
  const normalized = input.replace(/[,\s]/g, '');
  if (!normalized) return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Integer minor units back into an editable major-unit string. */
export function centsToInput(
  cents: number | string | null | undefined,
): string {
  const value = typeof cents === 'string' ? Number(cents) : (cents ?? 0);
  if (!Number.isFinite(value)) return '0';
  return (value / 100).toFixed(2);
}

export function formatBytes(size: number | string | null | undefined): string {
  const value = typeof size === 'string' ? Number(size) : (size ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let current = value;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

export function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}
