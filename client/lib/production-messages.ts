export interface TranslationCall {
  (key: string, options?: { defaultValue?: string }): string;
}

function messageOf(error: unknown): string | undefined {
  if (error instanceof Error && error.message) return error.message;
  return undefined;
}

export function errorCodeOf(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return 'UNKNOWN';
}

/**
 * Turns a server error into user-facing text. Application error codes are translated; anything else falls
 * back to the server message so an unexpected failure is still readable.
 */
export function translateError(t: TranslationCall, error: unknown): string {
  const code = errorCodeOf(error);
  const translated = t(`production.errors.${code}`, { defaultValue: '' });
  if (translated) return translated;
  return (
    messageOf(error) ??
    t('production.errors.UNKNOWN', { defaultValue: 'Request failed' })
  );
}
