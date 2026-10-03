import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';

type Translate = ReturnType<typeof useTranslation>['t'];

interface ErrorRecord {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

/**
 * Reads the code and message out of the body the API client attached to a
 * failed request. The client already lifts a top-level or nested
 * `{ error: { code, message } }` onto the error itself; reading the payload
 * too covers a body the client could not lift.
 */
function readErrorRecord(cause: unknown): {
  code: string | undefined;
  message: string | undefined;
} {
  if (cause instanceof ApiClientError) {
    const payload = cause.payload as ErrorRecord | undefined;
    const code =
      cause.code ?? stringOf(payload?.error?.code) ?? stringOf(payload?.code);
    const message =
      cause.message ||
      stringOf(payload?.error?.message) ||
      stringOf(payload?.message);
    return { code, message };
  }
  const record = cause as ErrorRecord | undefined;
  return {
    code: stringOf(record?.error?.code) ?? stringOf(record?.code),
    message: stringOf(record?.error?.message) ?? stringOf(record?.message),
  };
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Maps a rejected materials request onto the wording to show the user. A code
 * the application does not know still falls back to the server's own message
 * rather than an empty notice.
 */
export function materialErrorMessage(cause: unknown, t: Translate): string {
  const { code, message } = readErrorRecord(cause);
  switch (code) {
    case 'UNAUTHORIZED':
      return t('materials.loadFailed');
    case 'MATERIAL_NOT_FOUND':
    case 'ATTACHMENT_NOT_FOUND':
      return t('materials.notFound');
    case 'TITLE_REQUIRED':
      return t('materials.titleRequired');
    case 'TITLE_TOO_LONG':
      return t('materials.titleTooLong');
    case 'ATTACHMENT_IDS_INVALID':
      return t('materials.attachmentInvalid');
    case 'BODY_TOO_LARGE':
      return t('materials.uploadTooLarge');
    default:
      return message ?? t('materials.saveFailed');
  }
}
