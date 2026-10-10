import { ApiClientError } from '@nocobase/app-client';

/**
 * What a failed after-sales API request means to a user.
 *
 * The API client throws `ApiClientError` carrying the status and the standard
 * error body's `reason`, `domain` and `requestId`. A page never renders the
 * exception's own `message` — that is for developers — so this narrows the
 * failure to a kind the dictionaries can translate, and keeps the machine
 * reason and the request id for the operator to quote in a report.
 */
export type ServiceErrorKind =
  'unauthorized' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable';

export interface ServiceErrorInfo {
  readonly kind: ServiceErrorKind;
  /** The server's stable reason token, when it sent one. */
  readonly reason?: string;
  /** The correlation id the server logs the request under. */
  readonly requestId?: string;
}

export function describeServiceError(error: unknown): ServiceErrorInfo {
  if (error instanceof ApiClientError) {
    const kind: ServiceErrorKind =
      error.status === 401
        ? 'unauthorized'
        : error.status === 403
          ? 'forbidden'
          : error.status === 404
            ? 'notFound'
            : error.status === 409 ||
                error.status === 400 ||
                error.status === 422
              ? 'invalid'
              : 'unavailable';
    return {
      kind,
      ...(error.reason ? { reason: error.reason } : {}),
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }
  // A network failure is not an HTTP answer at all; it is grouped with the
  // server being unavailable, which is what the user can act on.
  return { kind: 'unavailable' };
}
