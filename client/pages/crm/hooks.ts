import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

import {
  getContact,
  getCustomer,
  getCustomerSummary,
  getOpportunity,
  listContacts,
  listCustomers,
  listOpportunities,
} from './api.js';
import type {
  Contact,
  Customer,
  CustomerSummary,
  Opportunity,
  OpportunityStage,
} from './types.js';

type ResourceLoader<T> = (api: ApiClient, signal: AbortSignal) => Promise<T>;

export interface ResourceState<T> {
  /** `true` while the first load or a reload is in flight; already-loaded data stays available. */
  readonly loading: boolean;
  readonly data: T | undefined;
  readonly error: unknown;
  /** Re-runs the request. Stable, so it can be passed through `<Outlet context>`. */
  readonly reload: () => void;
}

/**
 * Loads one CRM resource into component state, cancelling the request when the
 * key changes or the component unmounts. `requestKey` must change whenever
 * `load` would return different data: it is what tells an in-flight reload
 * apart from the response of the previous one.
 */
function useResource<T>(
  requestKey: string,
  load: ResourceLoader<T>,
): ResourceState<T> {
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const key = `${requestKey}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly data?: T;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    load(api, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setResult({ key, data });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ key, error });
        }
      },
    );
    return () => controller.abort();
  }, [api, key, load]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return {
    loading: result?.key !== key,
    data: result?.data,
    error: result?.key === key ? result.error : undefined,
    reload,
  };
}

export function useCustomers(): ResourceState<Customer[]> {
  const load = useCallback(
    (api: ApiClient, signal: AbortSignal) => listCustomers(api, signal),
    [],
  );
  return useResource('crm/customers', load);
}

export function useCustomer(id: number | string): ResourceState<Customer> {
  const load = useCallback(
    (api: ApiClient, signal: AbortSignal) => getCustomer(api, id, signal),
    [id],
  );
  return useResource(`crm/customers/${id}`, load);
}

export function useCustomerSummary(
  id: number | string,
): ResourceState<CustomerSummary> {
  const load = useCallback(
    (api: ApiClient, signal: AbortSignal) =>
      getCustomerSummary(api, id, signal),
    [id],
  );
  return useResource(`crm/customers/${id}/summary`, load);
}

export function useContacts(customerId?: number): ResourceState<Contact[]> {
  const load = useCallback(
    (api: ApiClient, signal: AbortSignal) =>
      listContacts(api, { customerId }, signal),
    [customerId],
  );
  return useResource(`crm/contacts?customerId=${customerId ?? 'all'}`, load);
}

export function useContact(id: number | string): ResourceState<Contact> {
  const load = useCallback(
    (api: ApiClient, signal: AbortSignal) => getContact(api, id, signal),
    [id],
  );
  return useResource(`crm/contacts/${id}`, load);
}

export function useOpportunities(
  stage?: OpportunityStage,
): ResourceState<Opportunity[]> {
  const load = useCallback(
    (api: ApiClient, signal: AbortSignal) =>
      listOpportunities(api, { stage }, signal),
    [stage],
  );
  return useResource(`crm/opportunities?stage=${stage ?? 'all'}`, load);
}

export function useOpportunity(
  id: number | string,
): ResourceState<Opportunity> {
  const load = useCallback(
    (api: ApiClient, signal: AbortSignal) => getOpportunity(api, id, signal),
    [id],
  );
  return useResource(`crm/opportunities/${id}`, load);
}
