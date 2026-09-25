/** The three opportunity stages shared by the API, the forms and the list filters. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export function isOpportunityStage(
  value: string | null,
): value is OpportunityStage {
  return OPPORTUNITY_STAGES.some((stage) => stage === value);
}

/** A customer as the API returns it; `industry` is optional. */
export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
}

/** A contact with the owning customer's name resolved by the API. */
export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: number;
  readonly customerName: string | null;
}

/** An opportunity with the owning customer's name resolved by the API. */
export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

/** The customer detail view: its contacts, its opportunities and the sum of their amounts. */
export interface CustomerDetail extends Customer {
  readonly contacts: Contact[];
  readonly opportunities: Opportunity[];
  readonly totalAmount: number;
}

/** What each list page passes to its child-route overlays through `<Outlet context>`. */
export interface CrmListOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/** What the customer detail drawer passes to its edit dialog through `<Outlet context>`. */
export interface CustomerDetailOutletContext {
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (customer: Customer) => void;
  /** Called when the record no longer exists. */
  readonly onNotFound: () => void;
}
