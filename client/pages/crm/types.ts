/**
 * Shared types for the CRM feature (Issue #504). The stage codes match the
 * values the server stores; the interface is where they become localized text.
 */
export const OPPORTUNITY_STAGES = ['follow_up', 'won', 'lost'] as const;

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

export interface CustomerDetail {
  readonly customer: Customer;
  readonly contacts: Contact[];
  readonly opportunities: Opportunity[];
  readonly totalExpectedAmount: number;
}

/** What a list page passes down to its create dialog through `<Outlet context>`. */
export interface ListOutletContext {
  /** Reloads the list in the background after a successful create. */
  readonly reload: () => void;
}

/** What a detail drawer passes down to its edit dialog through `<Outlet context>`. */
export interface DetailOutletContext<TRecord> {
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (record: TRecord) => void;
  /** Called when the record no longer exists, so the drawer can switch to "not found". */
  readonly onNotFound: () => void;
}

/** Renders a value that may be missing as an em dash, so a table cell never collapses. */
export function displayText(value: string | null | undefined): string {
  return value && value.length > 0 ? value : '—';
}
