import { useTranslation } from '@nocobase/i18n/client';
import type { LabRequestError } from './use-async.js';

/**
 * Codes the interface translates.
 *
 * A code that is not listed keeps the server's own message. That is deliberate: `INVALID_INPUT` and
 * `CONFLICT` carry the exact field or rule that failed ("Asset number X already exists."), and a
 * generic sentence would be less useful than a specific one.
 */
const TRANSLATED_CODES = new Set([
  'FORBIDDEN',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'REQUEST_FAILED',
  'UPLOAD_FAILED',
  'INVALID_FILE',
  'INVALID_MULTIPART',
  'UNSUPPORTED_MEDIA_TYPE',
  'BODY_TOO_LARGE',
]);

/** Turns a failed request into the sentence the page shows. */
export function useLabErrorMessage(
  error: LabRequestError | null | undefined,
): string | null {
  const { t } = useTranslation();
  if (!error) {
    return null;
  }
  if (!TRANSLATED_CODES.has(error.code)) {
    return error.message;
  }
  return t(`errors.${error.code}`, { defaultValue: error.message });
}
