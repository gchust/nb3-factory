import type { ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMe, type Me } from './api.js';

export interface AsyncState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

/**
 * Loads data whenever `key` changes and exposes a manual reload. The caller
 * passes the current filters as the key, so the effect depends on a single
 * stable string instead of a varying dependency list. Only the promise
 * callbacks update state, so a slow response cannot overwrite a newer one.
 */
export function useAsyncData<T>(
  load: () => Promise<T>,
  key: string,
): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let active = true;
    loadRef.current().then(
      (result) => {
        if (active) {
          setData(result);
          setError(undefined);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (active) {
          setError(cause);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [key, revision]);

  const reload = useCallback(() => {
    setLoading(true);
    setRevision((value) => value + 1);
  }, []);
  return { data, loading, error, reload };
}

export interface MeState {
  readonly me: Me | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

export function useRecruitmentMe(api: ApiClient): MeState {
  const state = useAsyncData(() => fetchMe(api), 'me');
  return {
    me: state.data,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
  };
}
