/** Shared types and constants for the IT repair pages. */

export const IT_TICKET_PAGE_ID = 'it.tickets';
export const IT_TICKET_RESOURCE_ID = 'it.tickets';

export type TicketCategory = 'computer' | 'account' | 'other';
export type TicketStatus = 'pending' | 'in_progress' | 'completed';

export const TICKET_CATEGORIES: readonly TicketCategory[] = [
  'computer',
  'account',
  'other',
];

export const TICKET_STATUSES: readonly TicketStatus[] = [
  'pending',
  'in_progress',
  'completed',
];

export type StatusTab = 'all' | TicketStatus;

/** A ticket as the API returns it, with the submitters' display names. */
export interface ItTicketView {
  readonly id: string;
  readonly title: string;
  readonly category: TicketCategory;
  readonly description: string;
  readonly status: TicketStatus;
  readonly ownerId: string;
  readonly handlerId: string | null;
  readonly resolution: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly ownerName: string | null;
  readonly handlerName: string | null;
}

/** What the list page passes to its create and detail child routes. */
export interface ItTicketsOutletContext {
  /** Reloads the list in the background, after a mutation changed a ticket. */
  readonly reload: () => void;
}

/** What the detail drawer passes to the completion dialog. */
export interface ItTicketDetailOutletContext {
  /** The ticket currently shown, used as the completion dialog's subject. */
  readonly ticket: ItTicketView;
  /** A completion succeeded: show the returned ticket and refresh the list. */
  readonly onCompleted: (ticket: ItTicketView) => void;
  /** The ticket disappeared while the dialog was open. */
  readonly onNotFound: () => void;
}
