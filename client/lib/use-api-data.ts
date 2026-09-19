import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiDataState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

interface Settled<T> {
  readonly key: string;
  readonly data: T | undefined;
  readonly error: unknown;
}

/**
 * Loads data through the application's HTTP client and tracks loading, error
 * and stale-response state. `key` identifies the request so a filter change
 * refetches; `load` may close over the current filters.
 *
 * `loading` is derived from whether the settled result belongs to the current
 * request, so an effect never has to set state synchronously before fetching.
 */
export function useApiData<T>(
  key: string,
  load: (api: ApiClient) => Promise<T>,
): ApiDataState<T> {
  const api = useApiClient();
  const loadRef = useRef(load);
  const [nonce, setNonce] = useState(0);
  const requestKey = `${key}#${nonce}`;
  const [settled, setSettled] = useState<Settled<T>>({
    key: '',
    data: undefined,
    error: undefined,
  });

  // Keep the latest loader available to the fetch effect without making the
  // inline closure a dependency (which would refetch on every render).
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let active = true;
    loadRef
      .current(api)
      .then((data) => {
        if (active) setSettled({ key: requestKey, data, error: undefined });
      })
      .catch((error: unknown) => {
        if (active) {
          setSettled({ key: requestKey, data: undefined, error });
        }
      });
    return () => {
      active = false;
    };
  }, [api, requestKey]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const current = settled.key === requestKey;
  return {
    data: current ? settled.data : undefined,
    error: current ? settled.error : undefined,
    loading: !current,
    reload,
  };
}

/** Turns an unknown request error into a readable, localized message. */
export function requestErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; payload?: unknown };
    if (typeof candidate.message === 'string' && candidate.message) {
      return candidate.message;
    }
    const payload = candidate.payload as
      { message?: unknown; code?: unknown } | undefined;
    if (payload && typeof payload.message === 'string' && payload.message) {
      return payload.message;
    }
    if (payload && typeof payload.code === 'string' && payload.code) {
      return payload.code;
    }
  }
  return fallback;
}
