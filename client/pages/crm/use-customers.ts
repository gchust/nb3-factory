import { useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';

import { fetchCustomers } from './api.js';
import type { Customer } from './types.js';

export interface CustomersState {
  readonly customers: readonly Customer[];
  readonly loading: boolean;
  readonly error?: unknown;
}

/**
 * The customer options a contact or opportunity form needs, loaded once when the
 * surrounding form mounts. The list is small (one sales team), so no search.
 */
export function useCustomers(): CustomersState {
  const api = useApiClient();
  const [state, setState] = useState<CustomersState>({
    customers: [],
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomers(api, { signal: controller.signal }).then(
      (customers) => {
        if (!controller.signal.aborted) {
          setState({ customers, loading: false });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ customers: [], loading: false, error });
        }
      },
    );
    return () => controller.abort();
  }, [api]);

  return state;
}
