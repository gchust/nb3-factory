import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useEffect, useRef, useState } from 'react';

import { errorMessage, subscribeQualityData } from './lib';

export interface ApiDataState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly reload: () => void;
}

/**
 * Loads data through the application's HTTP client. `key` re-runs the request
 * when filters change; `load` is kept in a ref so an inline function identity
 * does not restart the request on every render. Loading is derived from whether
 * the stored result matches the current key and revision, so no state is set
 * synchronously while the effect runs.
 */
export function useApiData<T>(
  load: (api: ApiClient) => Promise<T>,
  key = '',
): ApiDataState<T> {
  const api = useApiClient();
  const loadRef = useRef(load);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    revision: number;
    data?: T;
    error?: string;
  }>();

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    return subscribeQualityData(() => setRevision((value) => value + 1));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current(api)
      .then((data) => {
        if (!cancelled) setState({ key, revision, data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ key, revision, error: errorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, revision, key]);

  const loading = !state || state.key !== key || state.revision !== revision;
  return {
    data: loading ? undefined : state?.data,
    loading,
    error: loading ? undefined : state?.error,
    reload: () => setRevision((value) => value + 1),
  };
}
