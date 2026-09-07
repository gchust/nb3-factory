import { appApiClientToken, useService } from '@nocobase/app-client';
import { useMemo } from 'react';

import { SalesApi } from '../../lib/sales-api.js';

/**
 * Returns a memoized SalesApi bound to the application's API client.
 */
export function useSalesApi(): SalesApi {
  const appClient = useService(appApiClientToken);
  return useMemo(() => new SalesApi(appClient), [appClient]);
}
