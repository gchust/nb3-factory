/** The opportunity stages, in their stored form, shared by the pages and the API. */
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

/** A customer as the list endpoint returns it: the record plus its rollup counters. */
export interface CustomerSummary extends Customer {
  readonly contactCount: number;
  readonly opportunityCount: number;
  /** The sum of this customer's own opportunities' expected amounts. */
  readonly opportunityTotal: number;
}

/** A customer as the detail endpoint returns it, with only its own contacts and opportunities. */
export interface CustomerDetail extends CustomerSummary {
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
}

export interface CustomerInput {
  readonly name: string;
  readonly industry?: string | null;
}

export interface ContactInput {
  readonly name: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly customerId: number;
}

export interface OpportunityInput {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number;
  readonly stage: OpportunityStage;
}

export interface OpportunityListQuery {
  readonly stage?: OpportunityStage;
  readonly customerId?: number;
}

/** What the customers list page hands its child routes through `<Outlet context>`. */
export interface CustomersOutletContext {
  readonly reload: () => void;
}

/** What the customer detail drawer hands the edit dialog through `<Outlet context>`. */
export interface CustomerDetailOutletContext {
  readonly reloadDetail: () => void;
  readonly reloadList: () => void;
}

/** What the contacts list page hands its child routes through `<Outlet context>`. */
export interface ContactsOutletContext {
  readonly reload: () => void;
}

/** What the opportunities list page hands its child routes through `<Outlet context>`. */
export interface OpportunitiesOutletContext {
  readonly reload: () => void;
}
