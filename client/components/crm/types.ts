/** Domain types shared by the customer, contact and opportunity pages. */

/** The three stages an opportunity can be in. Stored as canonical codes and translated for display. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export function isOpportunityStage(value: unknown): value is OpportunityStage {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  );
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
}

export interface Contact {
  readonly id: number;
  readonly name: string;
  readonly contact: string | null;
  readonly customerId: number;
}

export interface Opportunity {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

/** What the customer detail view shows: the record, its contacts, its opportunities and the sum of their amounts. */
export interface CustomerDetail extends Customer {
  readonly contacts: Contact[];
  readonly opportunities: Opportunity[];
  /** Sum of every opportunity that belongs to this customer; other customers' opportunities are excluded. */
  readonly amountTotal: number;
}
