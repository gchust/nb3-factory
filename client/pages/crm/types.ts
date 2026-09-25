/**
 * Domain types shared by the simple CRM feature's pages. They describe what the
 * server returns: list endpoints add the resolved customer name and the
 * per-customer aggregates, while create and update return the bare record.
 */

export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export function isOpportunityStage(
  value: string | null | undefined,
): value is OpportunityStage {
  return OPPORTUNITY_STAGES.some((stage) => stage === value);
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
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
  readonly createdAt: string;
}

export interface ContactSummary extends Contact {
  readonly customerName: string | null;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string;
}

export interface OpportunitySummary extends Opportunity {
  readonly customerName: string | null;
}

export interface CustomerDetail extends CustomerSummary {
  readonly contacts: readonly ContactSummary[];
  readonly opportunities: readonly OpportunitySummary[];
}

/**
 * What each list page passes to its child routes through `<Outlet context>`.
 * The edit routes find their record in `rows`, so they do not need a
 * per-record endpoint of their own; the list page is always mounted, including
 * on a deep link.
 */
export interface CustomersOutletContext {
  readonly rows: readonly CustomerSummary[] | undefined;
  readonly reload: () => void;
}

export interface ContactsOutletContext {
  readonly rows: readonly ContactSummary[] | undefined;
  readonly reload: () => void;
}

export interface OpportunitiesOutletContext {
  readonly rows: readonly OpportunitySummary[] | undefined;
  readonly reload: () => void;
}
