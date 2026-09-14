/** Shared view helpers for the retail pages: table classes and value formatting. */

export const tableClass = 'w-full border-collapse text-sm';
export const theadClass =
  'border-b border-border text-left text-xs text-muted-foreground';
export const rowClass = 'border-b border-border/60 last:border-0';
export const cellClass = 'px-3 py-2 align-middle';

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Renders an unknown value as text without the object stringification `String()` produces. */
export function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}
