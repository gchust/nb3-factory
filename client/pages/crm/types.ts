/** 跟进中 / 赢单 / 输单, stored and sent as canonical values and translated for display. */
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

export interface CustomerDetail extends Customer {
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  readonly totalAmount: number;
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
