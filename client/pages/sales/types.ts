/** The three stages an opportunity moves through, mirroring the server enum. */
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

/** A customer together with the contacts and opportunities that belong to it. */
export interface CustomerDetail extends Customer {
  readonly contacts: Contact[];
  readonly opportunities: Opportunity[];
  readonly totalOpportunityAmount: number;
}

/** What the customer list passes to its create dialog and detail drawer. */
export interface CustomersOutletContext {
  readonly reload: () => void;
}

/** What the contact list passes to its create and edit dialogs. */
export interface ContactsOutletContext {
  readonly reload: () => void;
}

/** What the opportunity list passes to its create and edit dialogs. */
export interface OpportunitiesOutletContext {
  readonly reload: () => void;
}
