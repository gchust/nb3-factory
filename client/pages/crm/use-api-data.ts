import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiData<T> {
  /** The last successful result; kept while a reload is in flight. */
  readonly data?: T;
  /** The current request's failure, once it is the newest one. */
  readonly error?: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * Loads one request for the CRM pages.
 *
 * `key` identifies what is being requested: changing it (a different record
 * id, a different filter) starts a new request and never lets an older result
 * overwrite a newer one. `load` is called with an `AbortSignal` that is aborted
 * on unmount and whenever the key changes, so no state is set after the
 * component is gone. The loader is read from a ref, so an inline closure does
 * not restart the request on every render.
 */
export function useApiData<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): ApiData<T> {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${key}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly requestKey: string;
    readonly data?: T;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const currentKey = `${key}:${reloadCount}`;
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({ key, requestKey: currentKey, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, requestKey: currentKey, error });
      },
    );
    return () => controller.abort();
  }, [key, reloadCount]);

  // A result that does not belong to the current request is still loading. A result for another subject (a different
  // customer, a different filter) must not be shown while the new one loads, but the last result for the same subject
  // stays visible during a reload.
  const loading = result?.requestKey !== requestKey;

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  return {
    data: result?.key === key ? result.data : undefined,
    error: loading ? undefined : result?.error,
    loading,
    reload,
  };
}
