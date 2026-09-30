import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ServiceApi } from './service-api.js';

/** The service API bound to the application's client, stable across renders. */
export function useServiceApi(): ServiceApi {
  const client = useApiClient();
  return useMemo(() => new ServiceApi(client), [client]);
}

/**
 * Whether the session may perform a business action on one of the service
 * composites, such as `process` on `service.tickets`. The server enforces the
 * same grant on the endpoint, so this only decides whether to draw a control.
 */
export function useServicePermission(
  resourceId: string,
  action: string,
): boolean {
  const { can } = useCan({
    resource: { type: 'composite', id: resourceId },
    action,
  });
  return can;
}

export interface AsyncState<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  /** Reloads with the same arguments, or replaces the data optimistically. */
  readonly reload: () => void;
  readonly setData: (value: T | undefined) => void;
}

/**
 * Runs an async loader whenever `key` changes and tracks its three states.
 * `key` is a plain string so a caller cannot accidentally re-run the loader on
 * every render by passing a fresh object.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  key: string,
): AsyncState<T> {
  const [result, setResult] = useState<{
    readonly key: string;
    readonly data?: T;
    readonly error?: unknown;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  // The loader is deliberately not part of the dependency list: callers write it
  // inline, and `key` is the contract that says when the request must re-run.
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => loaderRef.current())
      .then(
        (value) => {
          if (active) setResult({ key, data: value });
        },
        (reason: unknown) => {
          if (active) setResult({ key, error: reason });
        },
      );
    return () => {
      active = false;
    };
  }, [key, revision]);

  const current = result?.key === key ? result : null;

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const setData = useCallback(
    (value: T | undefined) => setResult({ key, data: value }),
    [key],
  );

  return {
    data: current?.data,
    error: current?.error,
    loading: current === null,
    reload,
    setData,
  };
}
