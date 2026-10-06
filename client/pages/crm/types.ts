/** The only three stages an opportunity may be in, matching the server contract. */
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

/** `GET /api/crm/customers/:customerId` returns the customer plus its related records and total. */
export interface CustomerDetail extends Customer {
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  /** Sum of `amount` over exactly this customer's opportunities. */
  readonly opportunityAmountTotal: number;
}

/** What the customers list passes to its create dialog and detail page through `<Outlet context>`. */
export interface CustomersOutletContext {
  /** Refresh the list in the background. */
  readonly reload: () => void;
}

/** What the customer detail page passes to its edit dialog through `<Outlet context>`. */
export interface CustomerDetailOutletContext {
  /** Called after a successful save with the record the endpoint returned (guideline R2). */
  readonly onSaved: (customer: Customer) => void;
  /** Called when editing finds the record no longer exists (guideline R3). */
  readonly onNotFound: () => void;
}

/** What the contacts list passes to its create/edit dialogs through `<Outlet context>`. */
export interface ContactsOutletContext {
  readonly reload: () => void;
}

/** What the opportunities list passes to its create/edit dialogs through `<Outlet context>`. */
export interface OpportunitiesOutletContext {
  readonly reload: () => void;
}

export function isOpportunityStage(
  value: string | null,
): value is OpportunityStage {
  return (
    value !== null && (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  );
}
