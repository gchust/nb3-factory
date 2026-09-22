/**
 * Reads an untyped database or request value as text.
 *
 * The portable query builder and request bodies hand back `unknown`, and a bare
 * `String(value)` on an object would silently produce `[object Object]`. This
 * narrows to the scalar shapes the application stores and falls back otherwise.
 */
export function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}
