import { ApiClientError } from '@nocobase/app-client';

/**
 * Maps a failed request to a translation key, so every call site reports a
 * server-coded failure in the reader's language rather than the generic
 * message the HTTP client carries.
 */
export function libraryErrorKey(
  error: unknown,
  fallback = 'library.actionFailed',
): string {
  if (error instanceof ApiClientError) {
    const payload = error.payload;
    const payloadCode =
      payload !== null && typeof payload === 'object' && 'code' in payload
        ? payload.code
        : undefined;
    const serverCode =
      typeof payloadCode === 'string' ? payloadCode : undefined;
    switch (serverCode ?? error.code) {
      case 'FORBIDDEN':
      case 'LIBRARY_FORBIDDEN':
        return 'library.forbidden';
      case 'DOCUMENT_NOT_FOUND':
      case 'SHARE_NOT_FOUND':
        return 'library.notFound';
      case 'INVALID_TITLE':
        return 'library.titleRequired';
      case 'INVALID_RECIPIENT':
        return 'library.share.invalidRecipient';
      case 'INVALID_DOCUMENT':
        return 'library.share.invalidDocument';
      default:
        return fallback;
    }
  }
  return fallback;
}
