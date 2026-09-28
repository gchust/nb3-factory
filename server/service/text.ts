/**
 * A repository row is `Record<string, unknown>`, so a column reaches code as
 * `unknown`. `String(...)` on an `unknown` can render `[object Object]` for a
 * structured value and store it as if it were an identifier, so this narrows to
 * the primitives that have a meaningful text form and falls back otherwise.
 */
export function asText(value: unknown, fallback = ''): string {
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
  return fallback;
}
