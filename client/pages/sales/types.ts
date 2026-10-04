/** The three stages an opportunity can be in. The stored value is stable; the label is translated. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The customer detail view: the record itself plus everything owned by it. */
export interface CustomerDetail {
  readonly customer: Customer;
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  /** The sum of this customer's opportunity amounts, and no other customer's. */
  readonly totalAmount: number;
}

export interface CustomerInput {
  readonly name: string;
  readonly industry: string | null;
}

export interface ContactInput {
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
}

export interface OpportunityInput {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

/** What the customer list page passes to its create dialog and detail drawer. */
export interface CustomersOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/** What the customer detail drawer passes to the edit dialog stacked on it. */
export interface CustomerDetailOutletContext {
  /** Replaces the drawer's copy of the record with the one the endpoint returned, and refreshes the list. */
  readonly onSaved: (customer: Customer) => void;
  /** The record no longer exists: the drawer switches to its "not found" state and the list refreshes. */
  readonly onNotFound: () => void;
}

/** What the contacts list page passes to its create and edit dialogs. */
export interface ContactsOutletContext {
  readonly reload: () => void;
}

/** What the opportunities list page passes to its create and edit dialogs. */
export interface OpportunitiesOutletContext {
  readonly reload: () => void;
}
