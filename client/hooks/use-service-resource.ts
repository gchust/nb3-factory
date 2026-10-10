import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

/**
 * The result of one API-backed resource, with the three states a page has to
 * render and a way to read it again after a write.
 */
export interface ServiceResource<T> {
  /** Present once the request for the current key succeeded. */
  readonly data: T | undefined;
  /** The failure of the most recent request, or `undefined` once one succeeded. */
  readonly error: unknown;
  /** True while the value for the current key has not arrived yet. */
  readonly isPending: boolean;
  /** Reads the resource again. Safe to call from an event handler or an effect. */
  readonly reload: () => void;
}

/**
 * Reads one resource through the API client.
 *
 * `key` identifies the request the page is asking for — the search text, the
 * filters, the record id — and a change to it is what triggers a new read. The
 * request in flight is abandoned when `key` changes or the component unmounts,
 * so a slow answer cannot overwrite a newer one.
 *
 * `load` must be stable, which is what `useCallback` is for in the caller: a
 * new function on every render would ask for the resource on every render. The
 * signature takes the signal so the caller can pass it to the API client, and
 * the client is passed rather than resolved inside so the caller can also use
 * it for a write.
 */
export function useServiceResource<T>(
  key: string,
  load: (api: ApiClient, signal: AbortSignal) => Promise<T>,
): ServiceResource<T> {
  const api = useApiClient();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    requestKey: string;
    data?: T;
    error?: unknown;
  } | null>(null);

  const reload = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  const requestKey = `${key}\u0000${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    load(api, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) {
          setResult({ requestKey, data: value });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ requestKey, error });
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [api, load, requestKey]);

  const current = result?.requestKey === requestKey ? result : null;

  return {
    data: current ? current.data : undefined,
    error: current ? current.error : undefined,
    isPending: current === null,
    reload,
  };
}
