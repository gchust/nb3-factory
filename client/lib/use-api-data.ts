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
  readonly nonce: number;
  readonly data: T | undefined;
  readonly error: unknown;
}

/**
 * Loads data through the application's HTTP client and tracks loading, error
 * and stale-response state. `key` identifies the request so a filter change
 * refetches; `load` may close over the current filters.
 *
 * A reload of the same key keeps the previous result visible instead of
 * swapping the view for a spinner. The view therefore stays mounted, which
 * matters for in-flight work inside it: a spinner replacing an uploader mid
 * request would discard bytes that were already sent and never link them.
 * Changing the key still clears the result, so one record's data is never shown
 * for another.
 */
export function useApiData<T>(
  key: string,
  load: (api: ApiClient) => Promise<T>,
): ApiDataState<T> {
  const api = useApiClient();
  const loadRef = useRef(load);
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({
    key: UNRESOLVED,
    nonce: 0,
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
        if (active) setSettled({ key, nonce, data, error: undefined });
      })
      .catch((error: unknown) => {
        if (active) {
          setSettled({ key, nonce, data: undefined, error });
        }
      });
    return () => {
      active = false;
    };
  }, [api, key, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const sameKey = settled.key === key;
  const current = sameKey && settled.nonce === nonce;
  return {
    data: sameKey ? settled.data : undefined,
    error: current ? settled.error : undefined,
    loading: !current && !(sameKey && settled.data !== undefined),
    reload,
  };
}

/** A key no real request uses, so the first load always counts as unresolved. */
const UNRESOLVED = '\u0000unresolved';

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
