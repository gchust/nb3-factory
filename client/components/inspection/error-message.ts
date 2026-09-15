export const DEFAULT_ERROR_KEY: string = 'inspection.errors.generic';

/**
 * Map a server machine code to a translation key. Unknown codes fall back to a
 * generic message rather than leaking an internal code to the user.
 */
export function errorMessageKey(code: string | undefined): string {
  if (!code) return DEFAULT_ERROR_KEY;
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
  return `inspection.errors.${normalized}`;
}
