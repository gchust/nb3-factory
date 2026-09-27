/**
 * Reads a scalar as display text.
 *
 * Rows read through the database-layer query builder are `Record<string, unknown>`,
 * so a field is `unknown` until it is narrowed. Returning a string here keeps an
 * object or array from reaching a template literal, where it would be rendered as
 * `[object Object]`.
 */
export function textValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return fallback;
}
