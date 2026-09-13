import { useEffect, useState } from 'react';

export interface AsyncData<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

interface AsyncState<T> {
  key?: string;
  data?: T;
  error?: unknown;
}

/**
 * Loads data on mount and when `deps` change. The loader is read through a ref
 * so callers can pass an inline function without re-triggering the request on
 * every render.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
): AsyncData<T> {
  const [state, setState] = useState<AsyncState<T>>({});
  const [nonce, setNonce] = useState(0);
  const requestKey = `${JSON.stringify(deps ?? [])}|${nonce}`;

  useEffect(() => {
    let active = true;
    loader().then(
      (data) => {
        if (active) setState({ key: requestKey, data });
      },
      (error: unknown) => {
        if (active) setState({ key: requestKey, error });
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- the request key already captures every dependency.
  }, [requestKey]);

  const settled = state.key === requestKey;
  return {
    data: settled ? state.data : undefined,
    error: settled ? state.error : undefined,
    loading: !settled,
    reload: () => setNonce((value) => value + 1),
  };
}
