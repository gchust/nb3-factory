import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

export interface CrmDataState<T> {
  readonly data: T | null;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * Loads CRM data for a page and re-runs when `key` changes.
 *
 * The loader is read through a ref so the effect can depend on `key` and `version` alone: a loader
 * recreated on every render would otherwise restart the request on every render. `key` is the page's
 * identity — the resource plus any route parameter or filter — so navigation and filter changes
 * refetch, while a plain re-render does not. Previous data is kept while a reload is in flight, so a
 * list does not flash empty when a dialog closes above it.
 */
export function useCrmData<T>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
): CrmDataState<T> {
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  const [version, setVersion] = useState(0);
  // The identity of the request the state belongs to. `loading` is derived by comparing it with the
  // current request, so the effect never calls setState synchronously and a stale response cannot
  // claim a request it did not answer.
  const identity = `${key}#${version}`;
  const [state, setState] = useState<{
    identity: string | null;
    data: T | null;
    error: unknown;
  }>({ identity: null, data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    const requestIdentity = identity;
    loaderRef.current(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setState({ identity: requestIdentity, data, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setState((previous) => ({
          identity: requestIdentity,
          data: previous.data,
          error,
        }));
      },
    );
    return () => controller.abort();
  }, [identity]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  return {
    data: state.data,
    error: state.error,
    loading: state.identity !== identity,
    reload,
  };
}

/** Translated messages for {@link describeRequestError}, so pages do not repeat the string lookups. */
export function useRequestErrorMessages(): {
  invalidInput: string;
  notFound: string;
  generic: string;
} {
  const { t } = useTranslation();
  return {
    invalidInput: t('crm.common.invalidInput'),
    notFound: t('crm.common.notFound'),
    generic: t('crm.common.error'),
  };
}

/** Turns a failed request into a translated message, without leaking the server's English wording. */
export function describeRequestError(
  error: unknown,
  messages: { invalidInput: string; notFound: string; generic: string },
): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 400) return messages.invalidInput;
    if (status === 404) return messages.notFound;
  }
  return messages.generic;
}
