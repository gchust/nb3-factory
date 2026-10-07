import { useApiClient } from '@nocobase/app-client';

import { fetchCustomers, fetchOpportunities } from './api.js';
import type { EnumOption } from './form-fields.js';
import { useLoad } from './use-load.js';
import type { CustomerView, OpportunityView } from './types.js';

export interface OptionsState {
  readonly options: EnumOption[];
  readonly loading: boolean;
}

/** The customer choices for a picker, loaded only when it is shown. */
export function useCustomerOptions(
  enabled: boolean,
  selectedId?: number,
): OptionsState {
  const api = useApiClient();
  const { data, loading } = useLoad<CustomerView[]>(
    (signal) =>
      enabled
        ? fetchCustomers(api, { pageSize: 100, sort: 'name' }, signal).then(
            (result) => result.data,
          )
        : Promise.resolve([]),
    enabled ? 'customers:options' : 'customers:options:off',
  );

  const options: EnumOption[] = (data ?? []).map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));
  if (
    selectedId != null &&
    !options.some((option) => option.value === String(selectedId))
  ) {
    options.unshift({ value: String(selectedId), label: String(selectedId) });
  }
  return { options, loading: enabled && loading };
}

/** The opportunity choices of one customer, for the follow-up form. */
export function useOpportunityOptions(
  customerId: number | undefined,
  enabled: boolean,
): OptionsState {
  const api = useApiClient();
  const active = enabled && customerId != null;
  const { data, loading } = useLoad<OpportunityView[]>(
    (signal) =>
      active
        ? fetchOpportunities(
            api,
            { customerId, pageSize: 100, sort: 'newest' },
            signal,
          ).then((result) => result.data)
        : Promise.resolve([]),
    active
      ? `opportunities:options:${customerId}`
      : 'opportunities:options:off',
  );

  return {
    options: (data ?? []).map((opportunity) => ({
      value: String(opportunity.id),
      label: opportunity.name,
    })),
    loading: active && loading,
  };
}
