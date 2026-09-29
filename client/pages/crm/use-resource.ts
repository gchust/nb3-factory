import { useCallback, useEffect, useRef, useState } from 'react';

export interface ResourceResult<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

interface ResourceState<T> {
  readonly key: string | null;
  readonly version: number;
  readonly loading: boolean;
  readonly data?: T;
  readonly error?: unknown;
}

const initial = <T>(): ResourceState<T> => ({
  key: null,
  version: -1,
  loading: true,
});

/**
 * Loads a resource for the current `key` and exposes a `reload` that refetches
 * the same key. Kept local to the CRM pages; it holds no application state.
 *
 * `loading` is derived by comparing the stored request identity with the
 * current one instead of being written synchronously in the effect, so a
 * re-render never schedules a second, cascading update.
 */
export function useResource<T>(
  key: string,
  loader: () => Promise<T>,
): ResourceResult<T> {
  const loaderRef = useRef(loader);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ResourceState<T>>(initial);

  // Keep the newest loader available to the effect without making the inline
  // function an effect dependency.
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let active = true;
    loaderRef.current().then(
      (data) => {
        if (active) {
          setState({ key, version, loading: false, data });
        }
      },
      (error: unknown) => {
        if (active) {
          setState({ key, version, loading: false, error });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [key, version]);

  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const sameKey = state.key === key;
  const settled = sameKey && state.version === version;

  return {
    data: sameKey ? state.data : undefined,
    loading: settled ? state.loading : true,
    error: settled ? state.error : undefined,
    reload,
  };
}
