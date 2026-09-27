/** The three opportunity stages, matching the server's stable codes. */
export const OPPORTUNITY_STAGES = ['in-progress', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export function isOpportunityStage(
  value: string | null | undefined,
): value is OpportunityStage {
  return value === 'in-progress' || value === 'won' || value === 'lost';
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerSummary extends Customer {
  readonly contactCount: number;
  readonly opportunityCount: number;
  readonly totalAmount: number;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerDetail extends Customer {
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  readonly totalAmount: number;
}

/** What a list page passes to its child routes (create dialog, detail drawer) through `<Outlet context>`. */
export interface SalesListOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/** What the customer detail drawer passes to its edit dialog through `<Outlet context>`. */
export interface CustomerDetailOutletContext {
  /** Updates the drawer with the record the endpoint returned and refreshes the list behind it. */
  readonly onSaved: (customer: CustomerSummary) => void;
  /** The record no longer exists: the drawer switches to "not found" and the list refreshes. */
  readonly onNotFound: () => void;
}
