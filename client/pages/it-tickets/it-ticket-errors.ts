import { ApiClientError } from '@nocobase/app-client';

/**
 * Turns a failed request into wording for a user.
 *
 * The server's `message` is written for a developer and can name internals, so
 * it is never rendered; every string shown here is chosen from the response's
 * status and reason, both of which are part of the API's contract.
 */

/** The refused transitions the server reports, each with its own sentence. */
const STATE_REASON_KEYS: Readonly<Record<string, string>> = {
  IT_TICKET_NOT_PENDING: 'itTickets.state.IT_TICKET_NOT_PENDING',
  IT_TICKET_NOT_PROCESSING: 'itTickets.state.IT_TICKET_NOT_PROCESSING',
  IT_TICKET_ALREADY_COMPLETED: 'itTickets.state.IT_TICKET_ALREADY_COMPLETED',
  IT_TICKET_RESOLUTION_REQUIRED:
    'itTickets.state.IT_TICKET_RESOLUTION_REQUIRED',
};

export function ticketErrorMessage(
  t: (key: string) => string,
  error: unknown,
): string {
  if (error instanceof ApiClientError) {
    const stateKey = error.reason ? STATE_REASON_KEYS[error.reason] : undefined;
    if (stateKey) {
      return t(stateKey);
    }
    if (error.status === 401) {
      return t('itTickets.error.sessionExpired');
    }
    if (error.status === 403) {
      return t('itTickets.error.forbidden');
    }
    if (error.status === 404) {
      return t('itTickets.error.notFound');
    }
  }
  return t('itTickets.error.requestFailed');
}

/** Whether a failed request means the session has to be re-established. */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

/** Whether a failed request means the ticket does not exist, or is not this account's to see. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}
