import { useCallback, useEffect, useState } from 'react';

export interface ApiDataResult<T> {
  /** The last successful result, kept while a reload is in flight so the screen does not flash. */
  readonly data: T | undefined;
  /** The failure of the current request, or `undefined`. */
  readonly error: unknown;
  /** Whether the current request is still in flight. */
  readonly loading: boolean;
  /** Runs the loader again. */
  readonly reload: () => void;
}

/**
 * Runs one request and keeps its result, its failure and whether it is still in
 * flight. An aborted request is not a failure: its result and error are both
 * dropped, so a filter change or an unmount cannot overwrite a newer result or
 * show up as an error.
 *
 * `load` must be stable — wrap it in `useCallback` at the call site — because it
 * is the effect's dependency.
 */
export function useApiData<T>(
  load: (signal: AbortSignal) => Promise<T>,
): ApiDataResult<T> {
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    /** The reload this result belongs to; a mismatch with the current one means a request is in flight. */
    readonly key: number;
    readonly data?: T;
    readonly error?: unknown;
  }>({ key: -1 });

  useEffect(() => {
    const controller = new AbortController();
    const key = reloadCount;
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult((previous) => ({ key, data: previous.data, error }));
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [load, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return {
    data: result.data,
    error: result.error,
    loading: result.key !== reloadCount,
    reload,
  };
}
