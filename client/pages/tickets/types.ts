export const TICKET_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/** A ticket as the API returns it, with the display names the list and drawer show. */
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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly handledAt: string | null;
}

/** What the list page passes to its child routes (submit dialog, detail drawer) through `<Outlet context>`. */
export interface TicketsOutletContext {
  /** Refresh the list in the background. */
  readonly reload: () => void;
}

export function isTicketStatus(value: string | null): value is TicketStatus {
  return TICKET_STATUSES.some((status) => status === value);
}
