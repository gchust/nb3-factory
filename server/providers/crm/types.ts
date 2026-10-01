/**
 * Storage shapes and view models for the CRM feature (Issue #504).
 *
 * The records mirror the columns the migration created. Timestamps are ISO
 * strings because that is how the database layer encodes `datetime` fields.
 */

export const OPPORTUNITY_STAGES = ['follow_up', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  customerId: number;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityRecord {
  id: number;
  name: string;
  customerId: number;
  /** Decimal columns may arrive as a string; every view normalizes it. */
  amount: string | number;
  stage: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactView extends ContactRecord {
  customerName: string | null;
}

export interface OpportunityView extends Omit<OpportunityRecord, 'amount'> {
  amount: number;
  customerName: string | null;
}

export interface CustomerDetail {
  customer: CustomerRecord;
  contacts: ContactView[];
  opportunities: OpportunityView[];
  totalExpectedAmount: number;
}

export interface CustomerListQuery {
  search?: string;
}

export interface ContactListQuery {
  search?: string;
  customerId?: number;
}

export interface OpportunityListQuery {
  search?: string;
  customerId?: number;
  stage?: string;
}

export interface CustomerInput {
  name: string;
  industry?: string | null;
}

export interface ContactInput {
  name: string;
  customerId: number;
  phone?: string | null;
  email?: string | null;
}

export interface OpportunityInput {
  name: string;
  customerId: number;
  amount: number;
  stage: string;
}

/** A request that failed business validation. The route answers with 400. */
export class CrmValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'CrmValidationError';
    this.field = field;
  }
}

/** A referenced record does not exist. The route answers with 404. */
export class CrmNotFoundError extends Error {
  readonly code = 'NOT_FOUND';

  constructor(message: string) {
    super(message);
    this.name = 'CrmNotFoundError';
  }
}
