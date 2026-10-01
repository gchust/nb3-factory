import { useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';

import { fetchCustomers } from './crm-api.js';
import type { Customer } from './types.js';

export interface CustomerOptions {
  readonly customers: Customer[];
  readonly loading: boolean;
  readonly error: unknown;
}

/** Loads the customer list a contact or opportunity form picks from. */
export function useCustomerOptions(): CustomerOptions {
  const api = useApiClient();
  const [state, setState] = useState<{
    readonly customers?: Customer[];
    readonly error?: unknown;
  }>({});

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomers(api, {}, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setState({ customers: rows });
      },
      (caught: unknown) => {
        if (!controller.signal.aborted) setState({ error: caught });
      },
    );
    return () => controller.abort();
  }, [api]);

  return {
    customers: state.customers ?? [],
    error: state.error,
    loading: state.customers === undefined && state.error === undefined,
  };
}
