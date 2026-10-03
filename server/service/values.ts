/**
 * Value coercion for values that cross a database or JSON boundary.
 *
 * The query builder's row type is wider than the columns it selects, so a
 * direct `String(row.field)` can stringify an object as `[object Object]`.
 * These helpers narrow explicitly and never invent text for a value that is not
 * a scalar, which keeps request and log output predictable.
 */
export function asText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return '';
}

/** Returns the numeric value of a scalar, or null when it is not one. */
export function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Returns the ISO string of a temporal value, or null when it is not one. */
export function asIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const source =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : null;
  return source === null || Number.isNaN(source.getTime())
    ? null
    : source.toISOString();
}

/**
 * Narrows a query-builder row array to the shape the caller knows it selected.
 *
 * The query builder returns each column widened to `unknown`, so the narrowing
 * is real and has to stay: without it every field access is `unknown` and the
 * callers stop compiling. Asserting through `unknown[]` keeps the narrowing in
 * one documented place instead of at every call site.
 */
export function rowsOf<T>(rows: unknown[]): T[] {
  return rows as T[];
}

/** Narrows one query-builder row to the shape the caller selected, or undefined. */
export function rowOf<T>(row: unknown): T | undefined {
  return row === null || row === undefined ? undefined : (row as T);
}
