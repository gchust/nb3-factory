import { useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createDeliveryApi, type DeliveryApi } from '@/lib/delivery-api';

export function useDeliveryApi(): DeliveryApi {
  const api = useApiClient();
  return useMemo(() => createDeliveryApi(api), [api]);
}

export interface ResourceState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly reload: () => void;
}

interface Loaded<T> {
  /** The request the result belongs to; a mismatch means a request is in flight. */
  readonly requestKey: string;
  readonly data?: T;
  readonly error?: string;
}

/**
 * Load one resource and expose explicit loading and error states, so every page
 * can show something other than a blank surface while it waits.
 *
 * Loading is derived from the identity of the settled request rather than set
 * up front, which keeps the effect free of synchronous state updates. `key` is a
 * plain identity string; changing it or calling `reload()` refetches.
 */
export function useResource<T>(
  loader: (api: DeliveryApi) => Promise<T>,
  key = '',
): ResourceState<T> {
  const api = useDeliveryApi();
  const [token, setToken] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T>>({ requestKey: '' });
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const requestKey = `${key}#${token}`;

  useEffect(() => {
    let cancelled = false;
    void loaderRef
      .current(api)
      .then((value) => {
        if (!cancelled) setLoaded({ requestKey, data: value });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoaded({
            requestKey,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, requestKey]);

  const reload = useCallback(() => setToken((value) => value + 1), []);
  const settled = loaded.requestKey === requestKey;
  return {
    data: loaded.data,
    loading: !settled,
    error: settled ? loaded.error : undefined,
    reload,
  };
}
