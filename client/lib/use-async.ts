import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

interface AsyncValue<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

/**
 * Loads data once per dependency change and exposes a reload, keeping the last
 * successful value visible while a refresh is in flight so a detail page does
 * not blank out when the user refreshes it.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  const [value, setValue] = useState<AsyncValue<T>>({
    data: undefined,
    error: undefined,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  const latestRef = useRef(0);

  const reload = useCallback(() => {
    setValue((previous) => ({ ...previous, loading: true }));
    setNonce((previous) => previous + 1);
  }, []);

  useEffect(() => {
    const token = ++latestRef.current;
    loader()
      .then((data) => {
        if (token === latestRef.current) {
          setValue({ data, error: undefined, loading: false });
        }
      })
      .catch((cause: unknown) => {
        if (token === latestRef.current) {
          setValue({
            data: undefined,
            error: cause instanceof Error ? cause : new Error(String(cause)),
            loading: false,
          });
        }
      });
    // `loader` is intentionally read from the closure; `deps` decides when it reruns.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [...deps, nonce]);

  return { ...value, reload };
}
