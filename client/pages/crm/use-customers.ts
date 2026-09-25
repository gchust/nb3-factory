import { useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';

import type { Customer } from './types.js';

export interface CustomersState {
  /** `undefined` while the first request is in flight. */
  readonly customers?: readonly Customer[];
  readonly error?: unknown;
}

/**
 * Loads the customers a contact or opportunity can be assigned to. The contact
 * and opportunity forms both need the options; the list pages do not.
 */
export function useCustomers(): CustomersState {
  const api = useApiClient();
  const [state, setState] = useState<CustomersState>({});

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: Customer[] }>({
        path: 'customers',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setState({ customers: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setState({ error });
        },
      );
    return () => controller.abort();
  }, [api]);

  return state;
}
