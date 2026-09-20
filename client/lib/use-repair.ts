import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useEffect, useRef, useState } from 'react';

import { repairApi, type RepairSession } from './repair-api.js';

export interface ApiDataState<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * Loads data for a page.
 *
 * `key` is the identity of the request; the loader is kept in a ref so a new closure on every render does not start a
 * new request. Results are stored together with the key that produced them, so a superseded request can never show
 * its data and `loading` is derived rather than written from the effect.
 */
export function useApiData<T>(
  key: string,
  load: (api: ApiClient) => Promise<T>,
): ApiDataState<T> {
  const api = useApiClient();
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: unknown;
  }>();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadRef.current(api).then(
      (data) => {
        if (!cancelled) setResult({ key, data });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ key, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, key, nonce]);

  const current = result?.key === key ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: current === undefined,
    reload: () => setNonce((value) => value + 1),
  };
}

/** The signed-in user's repair role and capabilities. */
export function useRepairSession(): ApiDataState<RepairSession> {
  return useApiData('repair/session', (api) => repairApi.session(api));
}

export function useRepairMeta(): ApiDataState<
  Awaited<ReturnType<typeof repairApi.meta>>
> {
  return useApiData('repair/meta', (api) => repairApi.meta(api));
}
