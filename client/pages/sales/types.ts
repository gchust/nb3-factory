/** The stages an opportunity moves through, matching the enum the endpoint accepts. */
export const OPPORTUNITY_STAGES = ['following', 'won', 'lost'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly industry: string | null;
}

export interface Contact {
  readonly id: string;
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: string;
  readonly customerName: string;
}

export interface Opportunity {
  readonly id: string;
  readonly name: string | null;
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: number | null;
  readonly stage: OpportunityStage;
}

/** `GET /api/customers/:id` adds the customer's contacts, opportunities and the sum of their amounts. */
export interface CustomerDetail extends Customer {
  readonly contacts: Contact[];
  readonly opportunities: Opportunity[];
  readonly opportunityTotal: number;
}

/** The body of every list endpoint: one page of records and where it sits among all matching records. */
export interface SalesList<T> {
  readonly data: T[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    /** The number of matching records on all pages. */
    readonly total: number;
  };
}

/**
 * What an edit dialog reads through `<Outlet context>` from the view behind it, whether that view is a list or a
 * detail drawer. Both refresh when the record is saved or turns out to be gone.
 */
export interface SalesEditOutletContext<TRecord> {
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (record: TRecord) => void;
  /** Called on finding that the record no longer exists, so the view behind refreshes. */
  readonly onNotFound: () => void;
}

/** What the customer list passes to its child routes through `<Outlet context>`. */
export interface CustomersOutletContext extends SalesEditOutletContext<Customer> {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/** What the contact list passes to its child routes through `<Outlet context>`. */
export interface ContactsOutletContext extends SalesEditOutletContext<Contact> {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/** What the opportunity list passes to its child routes through `<Outlet context>`. */
export interface OpportunitiesOutletContext extends SalesEditOutletContext<Opportunity> {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}
