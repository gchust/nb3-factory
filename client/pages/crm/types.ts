/**
 * The customer, contact and opportunity shapes the CRM endpoints return, plus the contexts the overlays read through
 * `<Outlet context>` from the page they open over. The stored stage values live here, so a badge, a filter and a form
 * all agree on them.
 */

/** The stages an opportunity moves through, in pipeline order. These are the stored values; the interface translates them. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export function isOpportunityStage(
  value: string | null,
): value is OpportunityStage {
  return OPPORTUNITY_STAGES.some((stage) => stage === value);
}

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly industry: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Contact {
  readonly id: string;
  readonly name: string;
  readonly contact: string | null;
  readonly customerId: string;
  readonly customerName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Opportunity {
  readonly id: string;
  readonly name: string;
  readonly customerId: string;
  readonly customerName: string | null;
  readonly amount: number;
  readonly stage: OpportunityStage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerDetail extends Customer {
  readonly contacts: Contact[];
  readonly opportunities: Opportunity[];
  /** The sum of every opportunity this customer owns, not only the ones the response carries. */
  readonly opportunityAmountTotal: number;
}

/** The body of a list endpoint: one page of records and where it sits among all matching records. */
export interface CrmList<TItem> {
  readonly data: TItem[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/** One option of the customer picker: the id the form stores and the name the user reads. */
export interface CustomerOption {
  readonly value: string;
  readonly label: string;
}

/** What the create dialog and the detail drawer read from the list they open over. */
export interface CustomerListOutletContext {
  /** Refreshes the list's data in the background. */
  readonly reload: () => void;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (customer: Customer) => void;
  /** Called on finding that the record no longer exists. */
  readonly onNotFound: () => void;
}

/** What the customer edit dialog reads from the view behind it: the detail drawer, or the list for a row's menu. */
export interface CustomerEditOutletContext {
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (customer: Customer) => void;
  /** Called on finding that the record no longer exists. */
  readonly onNotFound: () => void;
}

/** What the contact create and edit dialogs read from the list they open over. */
export interface ContactListOutletContext {
  readonly reload: () => void;
}

/** What the opportunity create and edit dialogs read from the list they open over. */
export interface OpportunityListOutletContext {
  readonly reload: () => void;
}
