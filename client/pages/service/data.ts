/**
 * Data-loading helpers shared by the after-sales service pages.
 *
 * These live apart from `parts.tsx` on purpose: a file that exports React
 * components must not also export plain functions, or fast refresh cannot
 * update the components without discarding the module.
 */
import { useEffect, useState } from 'react';
import { ApiClientError } from '@nocobase/app-client';

export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error);
}

export interface LoadState<T> {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: string | null;
  reload(): void;
}

/**
 * Run one read for a page and keep its latest result.
 *
 * The loader is the effect's dependency, so a page must wrap it in
 * `useCallback` with exactly the values the request depends on. The identity of
 * that callback then decides when the read runs again; `reload()` forces one
 * more run without changing the query.
 */
export function useLoad<T>(loader: () => Promise<T>): LoadState<T> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<{
    readonly nonce: number;
    readonly loader: () => Promise<T>;
    readonly data: T | null;
    readonly error: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    loader().then(
      (value) => {
        if (active) {
          setSettled({ nonce, loader, data: value, error: null });
        }
      },
      (failure: unknown) => {
        if (active) {
          setSettled({
            nonce,
            loader,
            data: null,
            error: errorMessage(failure),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [nonce, loader]);

  // A result counts only for the request that asked for it: changing the loader
  // or forcing a reload makes the previous answer stale and the read pending
  // again, without an effect having to announce it first.
  const loading =
    settled === null || settled.nonce !== nonce || settled.loader !== loader;

  return {
    data: settled?.data ?? null,
    loading,
    error: loading ? null : (settled?.error ?? null),
    reload: () => setNonce((value) => value + 1),
  };
}

/**
 * A text field read from a `FormData`. A missing field, or one holding a file,
 * becomes an empty string rather than the platform's `[object File]` rendering.
 */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}
