import { useCallback, useEffect, useRef, useState } from 'react';

export interface ServiceQueryResult<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

interface QueryState<T> {
  readonly status: 'loading' | 'ready' | 'error';
  readonly data?: T;
  readonly error?: unknown;
}

/**
 * Loads one service endpoint and re-runs it when `key` changes or `reload()` is
 * called.
 *
 * `key` is a plain string because the dependency that matters is always a set of
 * primitives the caller can name (a record id, a filter combination, a
 * capability). Keeping it explicit avoids serializing object dependencies that
 * may be cyclic. Requests are aborted on unmount so a slow response cannot
 * update a page that is already gone.
 */
export function useServiceQuery<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  key: string,
): ServiceQueryResult<T> {
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading' }));
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const run = async () => {
      try {
        const value = await loaderRef.current(controller.signal);
        if (!active || controller.signal.aborted) return;
        setState({ status: 'ready', data: value });
      } catch (cause) {
        if (!active || controller.signal.aborted) return;
        setState((previous) => ({
          status: 'error',
          data: previous.data,
          error: cause,
        }));
      }
    };
    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, nonce]);

  return {
    data: state.data,
    error: state.error,
    loading: state.status === 'loading',
    reload,
  };
}
