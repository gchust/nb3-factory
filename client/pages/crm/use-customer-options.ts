import type { Customer } from './types.js';
import { fetchCustomers } from './api.js';
import { useRemoteData } from './use-remote-data.js';

/** The customers a contact or opportunity form can be assigned to. */
export function useCustomerOptions(): {
  readonly customers: Customer[];
  readonly loading: boolean;
} {
  const { data, loading } = useRemoteData('customers', fetchCustomers);
  return { customers: data ?? [], loading };
}
