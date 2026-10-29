import { useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

export interface LeaveResource<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

interface ResourceState<T> {
  readonly path: string;
  readonly revision: number;
  readonly data?: T;
  readonly loading: boolean;
  readonly error?: unknown;
}

/**
 * Loads one leave endpoint. `path` is relative to the application API base,
 * such as `leaveRequests?scope=mine`; a new path or `reload()` fetches again.
 * `keepPreviousData` holds the last result while the next one is pending so a
 * filtered table does not collapse to empty on every change.
 */
export function useLeaveResource<T>(
  path: string,
  {
    enabled = true,
    keepPreviousData = false,
  }: { readonly enabled?: boolean; readonly keepPreviousData?: boolean } = {},
): LeaveResource<T> {
  const api = useApiClient();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({
    path,
    revision: -1,
    loading: enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void api
      .request<T>({ path })
      .then((data) => {
        if (active) {
          setState({ path, revision: version, data, loading: false });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ path, revision: version, loading: false, error });
        }
      });
    return () => {
      active = false;
    };
  }, [api, enabled, path, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const stale = state.path !== path || state.revision !== version;
  return {
    data: enabled && (keepPreviousData || !stale) ? state.data : undefined,
    loading: enabled && (stale || state.loading),
    error: enabled && !stale ? state.error : undefined,
    reload,
  };
}

export function apiPath(
  path: string,
  query: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
