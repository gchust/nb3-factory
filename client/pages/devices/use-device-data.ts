import { useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

interface RequestState<T> {
  path: string | undefined;
  revision: number;
  data?: T;
  error?: unknown;
  loading: boolean;
}

/**
 * One read of a device-ledger endpoint, keyed by its path. A changed path starts loading immediately instead of
 * showing the previous page's rows under the new filter.
 */
export function useDeviceRequest<T>(path: string | undefined) {
  const api = useApiClient();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<RequestState<T>>({
    path,
    revision: -1,
    loading: Boolean(path),
  });

  useEffect(() => {
    if (!path) return;
    let active = true;
    void api.request<T>({ path }).then(
      (data) => {
        if (active) setState({ path, revision, data, loading: false });
      },
      (error: unknown) => {
        if (active) setState({ path, revision, error, loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [api, path, revision]);

  const current = state.path === path && state.revision === revision;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: Boolean(path) && !current,
    reload: useCallback(() => setRevision((value) => value + 1), []),
  };
}
