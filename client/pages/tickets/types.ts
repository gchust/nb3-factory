/** The ticket statuses, in the order the workflow passes through them. */
export const TICKET_STATUSES = ['pending', 'in_progress', 'completed'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** The support categories a ticket can be filed under. */
export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly category: TicketCategory;
  readonly description: string | null;
  readonly status: TicketStatus;
  readonly resolution: string | null;
  readonly submitterId: string;
  readonly submitterName: string | null;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The body of `GET /api/tickets`: one page of tickets and where it sits among all matching records. */
export interface TicketList {
  readonly data: Ticket[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    /** The number of matching records on all pages. */
    readonly total: number;
  };
}

/**
 * What the create dialog and the detail drawer read through `<Outlet context>`
 * from the list they open over: how to refresh it.
 */
export interface TicketsOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/**
 * What the complete dialog reads through `<Outlet context>` from the detail
 * drawer behind it: the record the endpoint returned, or that it is gone.
 */
export interface TicketDetailOutletContext {
  /** Called after a successful write with the latest record: the drawer shows it at once. */
  readonly onUpdated: (ticket: Ticket) => void;
  /** Called on finding the record no longer exists: the drawer switches to "not found". */
  readonly onNotFound: () => void;
  /**
   * Called when the endpoint refused the write because the ticket's status had
   * moved on (another handler started or completed it first): the drawer keeps
   * the record and reloads it, so the user sees the current state instead of
   * acting on a stale one.
   */
  readonly onStale: () => void;
}
