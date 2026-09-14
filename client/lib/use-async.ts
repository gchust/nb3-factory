import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: unknown };

export interface AsyncResult<T> {
  status: AsyncState<T>['status'];
  data: T | undefined;
  error: unknown;
  reload: () => Promise<void>;
}

/**
 * Runs an async loader on mount and whenever `key` changes, discarding stale responses.
 *
 * The loader is read through a ref so callers do not have to memoize it; a caller that needs the hook
 * to re-run passes a different `key`, such as a record id.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  key: string,
): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const loaderRef = useRef(loader);
  const requestIdRef = useRef(0);

  useEffect(() => {
    loaderRef.current = loader;
  });

  const run = useCallback((): Promise<void> => {
    const id = requestIdRef.current + 1;
    requestIdRef.current = id;
    // Resolve through a promise so no state is set synchronously inside the mount effect.
    return Promise.resolve(key)
      .then(() => {
        setState({ status: 'loading' });
        return loaderRef.current();
      })
      .then((data) => {
        if (requestIdRef.current === id) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (requestIdRef.current === id) setState({ status: 'error', error });
      });
  }, [key]);

  useEffect(() => {
    void run();
  }, [run]);

  return {
    status: state.status,
    data: state.data,
    error: state.error,
    reload: run,
  };
}
