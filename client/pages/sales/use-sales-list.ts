import { useApiClient } from '@nocobase/app-client';
import { useEffect, useReducer, useRef, useState } from 'react';

import type { SalesList } from './types.js';

/** The query parameters a list endpoint accepts. A key left out of the URL is left out of the request. */
export type SalesQuery = Readonly<Record<string, string | number | undefined>>;

export interface SalesListState<T> {
  /** The current page of records; while a reload runs, the previous page. */
  readonly rows?: T[];
  /** The number of matching records on all pages. */
  readonly total?: number;
  /** Whether the displayed state belongs to an older request. */
  readonly loading: boolean;
  readonly error?: unknown;
  readonly reload: () => void;
}

/**
 * Load one page of a sales list endpoint.
 *
 * The request key is a faithful serialization of `query`, so the effect re-runs exactly when a filter or page
 * changes; `query` itself is read through a ref, which keeps the effect's dependencies to values that are all stable
 * or part of the key.
 */
export function useSalesList<T>(
  path: string,
  query: SalesQuery,
): SalesListState<T> {
  const api = useApiClient();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const requestKey = `${JSON.stringify(query)}|${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: T[];
    readonly total?: number;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort when the filters change or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    api
      .request<SalesList<T>>({
        path,
        query: queryRef.current,
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({ key: requestKey, rows: data, total: meta.total });
          }
        },
        (error: unknown) => {
          // Keep the previous page on failure: after "Retry", show the old rows and a small Spinner, not the skeleton.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key: requestKey, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, path, requestKey]);

  const loading = result?.key !== requestKey;
  return {
    rows: result?.rows,
    total: result?.total,
    loading,
    error: loading ? undefined : result?.error,
    reload,
  };
}
