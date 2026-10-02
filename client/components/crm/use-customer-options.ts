import { useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';

import { fetchCustomers } from './crm-api.js';
import type { Customer } from './types.js';

export interface CustomerOptions {
  readonly customers: Customer[];
  readonly loading: boolean;
  readonly error?: unknown;
}

/** Loads the customer list once for a form's "owning customer" select. */
export function useCustomerOptions(): CustomerOptions {
  const api = useApiClient();
  const [state, setState] = useState<{
    readonly customers: Customer[];
    readonly loading: boolean;
    readonly error?: unknown;
  }>({ customers: [], loading: true });

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomers(api, controller.signal).then(
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
