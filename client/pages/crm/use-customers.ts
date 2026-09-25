import { useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';

import type { Customer } from './types.js';

export interface CustomerOptionsResult {
  /** `undefined` while the first request is in flight. */
  readonly customers?: Customer[];
  readonly error?: unknown;
}

/**
 * Loads the customer list for a "customer" select. It is shared by the contact
 * and opportunity forms and by the list filters, which all need the same
 * options and none of which owns `crm/customers`.
 */
export function useCustomers(): CustomerOptionsResult {
  const api = useApiClient();
  const [result, setResult] = useState<CustomerOptionsResult>();

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: Customer[] }>({
        path: 'crm/customers',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ customers: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ error });
        },
      );
    return () => controller.abort();
  }, [api]);

  return result ?? {};
}
