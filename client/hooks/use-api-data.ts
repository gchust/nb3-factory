import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiDataResult<T> {
  readonly data?: T;
  readonly error?: unknown;
  readonly loading: boolean;
  /** Requests the data again; the previous request is aborted. */
  readonly reload: () => void;
}

/**
 * Loads data for a component through a loader the caller supplies.
 *
 * `key` names the request: whenever it changes, the loader runs again, and
 * "loading" is derived from whether the result belongs to the current key, so
 * no synchronous state is written from the effect. The loader is read through
 * a ref, so a caller may write it inline and encode its inputs in `key`.
 * A refetch keeps the previous data until the new result arrives.
 */
export function useApiData<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): ApiDataResult<T> {
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly data?: T;
    readonly error?: unknown;
  }>();
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  const requestKey = `${reloadCount}:${key}`;

  useEffect(() => {
    const controller = new AbortController();
    const currentKey = `${reloadCount}:${key}`;
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key: currentKey, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: currentKey, error });
      },
    );
    return () => controller.abort();
  }, [key, reloadCount]);

  const loading = result?.key !== requestKey;
  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return {
    data: loading ? undefined : result?.data,
    error: loading ? undefined : result?.error,
    loading,
    reload,
  };
}
