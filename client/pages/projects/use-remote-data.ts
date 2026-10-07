import { useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

interface RemoteData<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * The result of the request the hook currently believes in. Pairing the payload with the path it came from lets the
 * hook drop a previous resource's data the moment the path changes without a state update in the effect body.
 */
interface Settled<T> {
  readonly path: string;
  readonly data?: T;
  readonly error?: unknown;
}

/**
 * Loads one resource of the collaboration API for the lifetime of a page and re-runs the request when `reload()` is
 * called after a mutation. Pages here are small and each request has exactly one owner, so a page-local hook is
 * enough; a shared cache would belong in a provider.
 *
 * During a `reload()` the previous payload stays on screen — only the first load shows a spinner. A failed reload
 * clears the payload so the page shows the error instead of data the server no longer stands behind.
 */
export function useRemoteData<T>(path: string | null): RemoteData<T> {
  const api = useApiClient();
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>();

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    if (path === null) return undefined;
    const controller = new AbortController();
    api.request<{ data: T }>({ path, signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) setSettled({ path, data: result.data });
      },
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({ path, error: failure });
      },
    );
    return () => controller.abort();
  }, [api, path, version]);

  // A settlement from another path is not this path's result, so it reads as "still loading".
  const current = settled && settled.path === path ? settled : undefined;

  return {
    data: current?.data,
    error: current?.error,
    loading: path !== null && current === undefined,
    reload,
  };
}
