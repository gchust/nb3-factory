import { useEffect, useRef, useState } from 'react';

export interface AsyncDataState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: boolean;
  readonly reload: () => void;
}

/**
 * Loads data for a page and keeps loading, error and reload state in one place.
 *
 * `deps` is serialized into the effect dependency so a caller can pass an inline
 * loader without causing a reload on every render, while an explicit reload
 * still refetches. State only changes from the async callbacks, which keeps the
 * effect free of the synchronous render-cascading updates the linter rejects.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncDataState<T> {
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });
  const [state, setState] = useState<{
    data: T | undefined;
    loading: boolean;
    error: boolean;
  }>({ data: undefined, loading: true, error: false });
  const [version, setVersion] = useState(0);
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;
    loaderRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState((current) => ({ ...current, loading: false, error: true }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [depsKey, version]);

  return {
    ...state,
    reload: () => {
      setState((current) => ({ ...current, loading: true, error: false }));
      setVersion((value) => value + 1);
    },
  };
}
