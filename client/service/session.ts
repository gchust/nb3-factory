import { useMemo } from 'react';

import { useServiceApi } from './api.js';
import { useAsync } from './ui.js';
import type { ServiceSessionContext } from './types.js';

/**
 * One request per API client, shared by every page that asks for the session.
 *
 * The role drives which maintenance controls a page offers. It is presentation
 * only: each endpoint re-checks authorization, so a stale or wrong answer here
 * cannot grant anything.
 */
const cache = new WeakMap<object, Promise<ServiceSessionContext>>();

export interface SessionState {
  readonly session: ServiceSessionContext | undefined;
  readonly isSupervisor: boolean;
  readonly isEngineer: boolean;
  readonly isObserver: boolean;
  readonly isIntegration: boolean;
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => void;
}

export function useSession(): SessionState {
  const api = useServiceApi();
  const { data, error, loading, reload } = useAsync(() => {
    const existing = cache.get(api);
    if (existing) {
      return existing;
    }
    const request = api.context();
    cache.set(api, request);
    return request;
  }, [api]);
  return useMemo(
    () => ({
      session: data,
      isSupervisor: data?.role.supervisor ?? false,
      isEngineer: data?.role.engineer ?? false,
      isObserver: data?.role.observer ?? false,
      isIntegration: data?.role.integration ?? false,
      loading,
      error,
      reload: () => {
        cache.delete(api);
        reload();
      },
    }),
    [api, data, error, loading, reload],
  );
}
