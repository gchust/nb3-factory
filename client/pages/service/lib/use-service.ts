import { useApiClient } from '@nocobase/app-client';
import { useMemo } from 'react';

import { ServiceClient } from './api.js';
import type { Bootstrap } from './types.js';
import { useServiceQuery } from './use-service-query.js';

export function useServiceClient(): ServiceClient {
  const api = useApiClient();
  return useMemo(() => new ServiceClient(api), [api]);
}

/**
 * The signed-in caller and the backend's capability flags for them. The
 * server independently enforces every capability; this only decides which
 * controls to render.
 */
export function useCaller(): {
  readonly data: Bootstrap | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
} {
  const client = useServiceClient();
  return useServiceQuery(() => client.bootstrap(), 'bootstrap');
}
