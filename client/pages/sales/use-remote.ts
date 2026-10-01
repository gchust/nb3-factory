import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

/** The optional filters the list endpoints accept; `undefined` means "no filter". */
export interface RemoteListFilter {
  readonly customerId?: number;
  readonly stage?: string;
}

export interface RemoteListState<T> {
  readonly data: T[];
  readonly loading: boolean;
  readonly error: boolean;
  /** Requests the list again; call it after a create or an edit. */
  readonly reload: () => void;
}

interface ListResult<T> {
  /** The request this result answers; `isCurrent` compares it with the live one. */
  readonly key: string;
  readonly data: T[];
  readonly failed: boolean;
}

/**
 * Loads a list endpoint and keeps its loading and failure state. The request is
 * aborted when the component goes away or the filter changes, so a slow earlier
 * response cannot overwrite a newer one.
 *
 * The hook never sets state before the request settles: `loading` is derived by
 * comparing the key a result answers with the key the current inputs ask for.
 * A newer key therefore shows as loading without an extra render.
 */
export function useRemoteList<T>(
  path: string,
  { customerId, stage }: RemoteListFilter = {},
): RemoteListState<T> {
  const api = useApiClient();
  const [result, setResult] = useState<ListResult<T>>();
  const [revision, setRevision] = useState(0);

  const key = `${path}|${customerId ?? ''}|${stage ?? ''}|${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${path}|${customerId ?? ''}|${stage ?? ''}|${revision}`;
    api
      .request<{ data: T[] }>({
        path,
        query: { customerId, stage },
        signal: controller.signal,
      })
      .then((response) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, data: response.data, failed: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, data: [], failed: true });
        }
      });
    return () => controller.abort();
  }, [api, path, customerId, stage, revision]);

  const current = result?.key === key ? result : undefined;
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  return {
    data: current?.data ?? [],
    loading: current === undefined,
    error: current?.failed ?? false,
    reload,
  };
}

export interface RemoteOneState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: boolean;
  /** The endpoint answered 404: the record has been deleted. */
  readonly notFound: boolean;
  readonly reload: () => void;
}

interface OneResult<T> {
  readonly key: string;
  readonly status: 'success' | 'error' | 'notFound';
  readonly data: T | undefined;
}

/** Loads a single record by id, distinguishing a missing record from a failed request. */
export function useRemoteOne<T>(
  path: string,
  id: number | undefined,
): RemoteOneState<T> {
  const api = useApiClient();
  const [result, setResult] = useState<OneResult<T>>();
  const [revision, setRevision] = useState(0);

  const key = id === undefined ? undefined : `${path}/${id}#${revision}`;

  useEffect(() => {
    if (id === undefined) {
      return;
    }
    const controller = new AbortController();
    const requestKey = `${path}/${id}#${revision}`;
    api
      .request<{ data: T }>({
        path: `${path}/${encodeURIComponent(id)}`,
        signal: controller.signal,
      })
      .then((response) => {
        if (!controller.signal.aborted) {
          setResult({
            key: requestKey,
            status: 'success',
            data: response.data,
          });
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setResult({
          key: requestKey,
          status:
            caught instanceof ApiClientError && caught.status === 404
              ? 'notFound'
              : 'error',
          data: undefined,
        });
      });
    return () => controller.abort();
  }, [api, path, id, revision]);

  const current = key !== undefined && result?.key === key ? result : undefined;
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  return {
    data: current?.status === 'success' ? current.data : undefined,
    loading: key !== undefined && current === undefined,
    error: current?.status === 'error',
    notFound: current?.status === 'notFound',
    reload,
  };
}
