/**
 * Renders a loosely typed record value as display text.
 *
 * Query-adapter rows and untyped Repository rows carry values the compiler can
 * only describe as `unknown`. Interpolating one directly would call the
 * object's default `toString` and print `[object Object]`; this narrows to the
 * scalar the value actually is, and falls back to JSON for structured values so
 * a mistake is visible rather than silent.
 */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}
