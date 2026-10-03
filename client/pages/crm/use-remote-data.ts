import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface RemoteData<T> {
  /** The last successful value; stays while a reload is in flight. */
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * Loads one value through the application's API client.
 *
 * The result is stored together with the request that produced it, so a slow
 * earlier request can never overwrite a newer one. `key` names the request: it
 * changes with the route when the page depends on a parameter, and `reload()`
 * adds a new one.
 */
export function useRemoteData<T>(
  key: string,
  load: (api: ApiClient, signal: AbortSignal) => Promise<T>,
): RemoteData<T> {
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${key}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly data?: T;
    readonly error?: unknown;
  }>();

  // Keep the latest loader without making it an effect dependency: it is a new
  // function on every render, and only `key` decides when to request again.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    const currentKey = `${key}:${reloadCount}`;
    loadRef.current(api, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key: currentKey, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: currentKey, error });
      },
    );
    return () => controller.abort();
  }, [api, key, reloadCount]);

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  const loading = result?.key !== requestKey;
  return {
    data: result?.data,
    error: loading ? undefined : result?.error,
    loading,
    reload,
  };
}
