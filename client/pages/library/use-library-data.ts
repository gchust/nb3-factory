import { useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

/**
 * A tiny read hook for the library screens. It keeps the request, its loading
 * state and a reload counter together so a successful write can refresh the
 * list without losing the screen underneath.
 */
export function useLibraryData<T>(path: string) {
  const api = useApiClient();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    revision: number;
    data?: T;
    error?: unknown;
    loading: boolean;
  }>({ path, revision: -1, loading: true });

  useEffect(() => {
    let active = true;
    void api.request<T>({ path }).then(
      (data) => {
        if (active) setResult({ path, revision, data, loading: false });
      },
      (error: unknown) => {
        if (active) setResult({ path, revision, error, loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [api, path, revision]);

  return {
    data: result.path === path ? result.data : undefined,
    error: result.path === path ? result.error : undefined,
    loading: result.path !== path || result.revision !== revision,
    reload: useCallback(() => setRevision((value) => value + 1), []),
  };
}
