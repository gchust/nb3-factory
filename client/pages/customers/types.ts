import type { Customer } from '@/components/crm/types.js';

/** What the customers list page passes to its child routes through `<Outlet context>`. */
export interface CustomersOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/** What the customer detail drawer passes to the edit dialog through `<Outlet context>`. */
export interface CustomerDetailOutletContext {
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (customer: Customer) => void;
  /** Called when the record no longer exists. */
  readonly onNotFound: () => void;
}
