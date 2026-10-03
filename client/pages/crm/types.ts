/** The only stages a sales opportunity may be in, matching the server enum. */
export const CRM_STAGES = ['follow_up', 'won', 'lost'] as const;

export type CrmStage = (typeof CRM_STAGES)[number];

export interface CustomerRef {
  readonly id: number;
  readonly name: string;
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
  readonly customer: CustomerRef | null;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: CrmStage;
  readonly customer: CustomerRef | null;
}

export interface CustomerDetail {
  readonly customer: Customer;
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  /** Sum of the expected amounts of this customer's opportunities only. */
  readonly opportunityTotal: number;
}

/** What the customers list passes to its create dialog and detail drawer. */
export interface CustomersOutletContext {
  readonly reload: () => void;
}

/** What the customer detail drawer passes to its edit dialog. */
export interface CustomerDetailOutletContext {
  readonly onSaved: (customer: Customer) => void;
  readonly onNotFound: () => void;
}

/** What the contacts list passes to its create and edit dialogs. */
export interface ContactsOutletContext {
  readonly reload: () => void;
}

/** What the opportunities list passes to its create and edit dialogs. */
export interface OpportunitiesOutletContext {
  readonly reload: () => void;
}
