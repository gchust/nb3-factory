export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface CustomerDetail extends Customer {
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  readonly opportunityTotal: number;
}

/** What the list pages pass to their create dialog through `<Outlet context>`. */
export interface ListOutletContext {
  readonly reload: () => void;
}

/** What the customer detail drawer passes to its edit dialog through `<Outlet context>`. */
export interface CustomerDetailOutletContext {
  readonly onSaved: () => void;
}
