/**
 * The ticket vocabulary and the payloads this page exchanges with the API.
 *
 * The string values are the stable identifiers the server stores; every
 * wording shown to a user is looked up in the application locale files by these
 * values, so the two halves cannot drift apart.
 */

/**
 * The page id the route declares in `authz` and the composite resource the
 * action checks name. It is the same id the initial Permission Sets grant.
 */
export const IT_TICKETS_PAGE_ID = 'itTickets';

export const IT_TICKET_STATUSES = [
  'pending',
  'processing',
  'completed',
] as const;

export type ItTicketStatus = (typeof IT_TICKET_STATUSES)[number];

export const IT_TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;

export type ItTicketCategory = (typeof IT_TICKET_CATEGORIES)[number];

/** One ticket as `GET /api/itTickets` returns it. */
export interface ItTicket {
  readonly id: string;
  readonly title: string;
  readonly category: ItTicketCategory;
  readonly description: string | null;
  readonly status: ItTicketStatus;
  readonly resolutionNote: string | null;
  readonly submitterId: string;
  readonly submitterName: string;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The body of `GET /api/itTickets`: one page of tickets and where it sits among all matching records. */
export interface ItTicketList {
  readonly data: ItTicket[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    /** The number of matching records on all pages. */
    readonly total: number;
  };
}

/** The body of `POST /api/itTickets`. */
export interface ItTicketCreateInput {
  readonly title: string;
  readonly category: ItTicketCategory;
  readonly description?: string | null;
}

/**
 * What the create dialog and the detail drawer read through `<Outlet context>`
 * from the list they open over: the list's own refresh function.
 */
export interface ItTicketsOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/**
 * What the complete dialog reads through the drawer's own `<Outlet context>`:
 * the drawer shows the record the endpoint returned right away, and the list
 * behind it refreshes afterwards.
 */
export interface ItTicketDetailOutletContext {
  /** A write succeeded; the argument is the record the endpoint returned. */
  readonly onUpdated: (ticket: ItTicket) => void;
  /** The record no longer exists, or is no longer visible to this account. */
  readonly onGone: () => void;
  /** Read the record again, e.g. after a transition was refused as already done. */
  readonly onRefresh: () => void;
}

/** Whether a status parameter from the URL names a status this application knows. */
export function isItTicketStatus(
  value: string | null,
): value is ItTicketStatus {
  return IT_TICKET_STATUSES.some((status) => status === value);
}
