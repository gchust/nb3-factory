/**
 * Small helpers the ticket pages share: a request id for the retries of one action, and the user-facing text of a
 * failed request.
 */
import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';

/**
 * A key reused by the retries of one action, so a double submission changes the ticket once. `crypto.randomUUID` is
 * unavailable outside a secure context, so a fallback keeps the pages working on a plain-HTTP deployment.
 */
export function newRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ErrorPayload {
  readonly reason?: string;
  readonly fieldViolations?: readonly { readonly description?: string }[];
  readonly metadata?: {
    readonly blockers?: readonly { readonly message?: string }[];
    readonly problems?: readonly { readonly message?: string }[];
  };
}

function readPayload(payload: unknown): ErrorPayload | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const { error } = payload as { error?: unknown };
  if (!error || typeof error !== 'object') return undefined;
  return error;
}

/**
 * The text to show for a failed request.
 *
 * The lifecycle reports a refused transition in the standard body: the guards' blockers and the input problems are
 * bilingual, because the server does not know the reader's language, so they are shown as they are. Everything else
 * falls back to the page's own wording.
 */
export function useApiErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return (error: unknown): string => {
    if (!(error instanceof ApiClientError)) {
      return t('serviceDesk.error.requestFailed');
    }
    if (error.status === 401) return t('status.sessionExpired');
    if (error.status === 403) return t('serviceDesk.error.forbidden');
    if (error.status === 404) return t('serviceDesk.error.notFound');

    const payload = readPayload(error.payload);
    if (payload?.reason === 'CONFLICT') return t('serviceDesk.error.conflict');
    const detail =
      payload?.metadata?.blockers?.[0]?.message ??
      payload?.fieldViolations?.[0]?.description ??
      payload?.metadata?.problems?.[0]?.message;
    return typeof detail === 'string' && detail !== ''
      ? detail
      : t('serviceDesk.error.requestFailed');
  };
}
