/**
 * Small data-fetching helpers over the application's API client.
 *
 * The pages only need three things: run a query whenever its arguments change,
 * reload it after a mutation, and show the server's own error when it fails.
 * Keeping that here means a page focuses on its table and fields.
 */

import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** Query values the client accepts; `undefined` means the parameter is omitted. */
export interface ApiQuery {
  readonly [key: string]: string | number | boolean | undefined;
}

export interface QueryState<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  /** Re-runs the query, for example after a create, update or transition. */
  readonly reload: () => void;
}

/** Options for a conditional query whose arguments are not known yet. */
export interface QueryOptions {
  /** When `false`, the request is skipped and the state stays empty. */
  readonly enabled?: boolean;
}

/**
 * Reads one API path, re-running when the path or any query value changes.
 *
 * The query object is compared by its serialized value, so a page may build it
 * inline on every render without causing a request loop.
 */
export function useApiQuery<T>(
  path: string,
  query?: ApiQuery,
  options?: QueryOptions,
): QueryState<T> {
  const client = useApiClient();
  const enabled = options?.enabled ?? true;
  const queryKey = JSON.stringify(query ?? {});
  const stableQuery = useMemo(
    () => JSON.parse(queryKey) as ApiQuery,
    [queryKey],
  );
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    readonly requestKey: string;
    readonly data?: T;
    readonly error?: unknown;
  }>({ requestKey: '' });
  const requestKey = `${path}?${queryKey}#${version}`;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    client
      .request<T>({ path, query: stableQuery, signal: controller.signal })
      .then(
        (data) => {
          if (!controller.signal.aborted) setState({ requestKey, data });
        },
        (error) => {
          if (!controller.signal.aborted) setState({ requestKey, error });
        },
      );
    return () => controller.abort();
  }, [client, enabled, path, stableQuery, requestKey, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const current = state.requestKey === requestKey ? state : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    reload,
  };
}

/** The API client, exposed so a page can post a mutation and then reload a query. */
export function useClient(): ApiClient {
  return useApiClient();
}

/**
 * A value that only catches up after the reader stops changing it.
 *
 * A search box feeds this into its query so typing does not fire one request per
 * keystroke, while the input itself stays responsive.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
