import { format } from 'date-fns';
import { useEffect, useState } from 'react';

/** Presentation helpers shared by the after-sales service pages. */

export function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}

export function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function formatDate(value: unknown): string {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '—';
}

export function formatDateTime(value: unknown): string {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd HH:mm') : '—';
}

export function formatBytes(value: unknown): string {
  const size = asNumber(value);
  if (size === undefined) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** A decimal amount kept as a string by the database, shown with two decimals. */
export function formatAmount(value: unknown): string {
  const amount = asNumber(value);
  if (amount === undefined) return '—';
  return amount.toFixed(2);
}

export function joinTags(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed))
        return parsed.map((item) => String(item)).join(', ');
    } catch {
      // Not JSON; show the stored string as-is.
    }
    return value;
  }
  return '';
}

function toDate(value: unknown): Date | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const date = new Date(asText(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Delays a rapidly changing value, so a search box queries once the typing stops. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

/** A testable, human-readable key for the current date, `YYYY-MM-DD`. */
export function todayKey(now = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}
