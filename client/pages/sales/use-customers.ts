import { useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';

import { fetchCustomers } from './api.js';
import type { CustomerSummary } from './types.js';

export interface CustomersState {
  readonly customers?: CustomerSummary[];
  readonly error?: unknown;
  readonly loading: boolean;
}

/** Loads the customer list once for the forms that need to choose an owning customer. */
export function useCustomers(): CustomersState {
  const api = useApiClient();
  const [result, setResult] = useState<{
    readonly customers?: CustomerSummary[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomers(api, controller.signal).then(
      (customers) => {
        if (!controller.signal.aborted) setResult({ customers });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ error });
      },
    );
    return () => controller.abort();
  }, [api]);

  return {
    customers: result?.customers,
    error: result?.error,
    loading: result === undefined,
  };
}
