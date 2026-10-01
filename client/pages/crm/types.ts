export const OPPORTUNITY_STAGES = ['nurturing', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

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
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

export interface CustomerSummary {
  readonly customer: Customer;
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  readonly opportunityCount: number;
  readonly opportunityTotal: number;
}

/** What each list page passes to its create/edit child routes through `<Outlet context>`. */
export interface CrmListOutletContext {
  /** Refreshes the list in the background after a record was created or edited. */
  readonly reload: () => void;
}

/** What the customer detail drawer passes to its edit dialog through `<Outlet context>`. */
export interface CustomerDetailOutletContext {
  /** Called after a successful save with the record the endpoint returned; the drawer shows it and refreshes the list. */
  readonly onSaved: (customer: Customer) => void;
  /** Called when the record no longer exists: the drawer switches to its not-found notice and refreshes the list. */
  readonly onNotFound: () => void;
}
