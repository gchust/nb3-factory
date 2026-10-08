/**
 * A collection `datetime` field only accepts a full V1 temporal value, but a
 * browser control submits a partial one: `<input type="date">` sends a bare
 * day, and `<input type="datetime-local">` sends a day and time without
 * seconds. Those are the values the form showed the user, so the missing
 * clock parts are completed rather than refusing the save; a value that already
 * carries seconds, milliseconds or an offset, and anything this cannot
 * recognize, is returned unchanged so the collection's own validator stays the
 * single authority on what is acceptable.
 */
export function normalizeDateTime(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00.000`;
  }
  return value;
}

/**
 * Coerces a value read from a raw Repository row into text for display,
 * logging and matching. Repository records arrive as unknown scalars, so this
 * narrows explicitly instead of relying on `String()`'s default object
 * formatting.
 */
export function coerceText(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'bigint':
    case 'boolean':
      return String(value);
    default:
      return '';
  }
}
