/**
 * Shared types and the status/category vocabulary of the IT repair request
 * feature. The client keeps its own copy of the values the server owns in
 * `server/it/rules.ts`; only the wire shape has to stay in step.
 */

/** The composite resource the authorization server registers for these tickets. */
export const IT_TICKETS_RESOURCE = 'it.tickets';

/** The page grant id declared on the `/it/requests` route. */
export const IT_TICKETS_PAGE = 'it.requests';

export const IT_TICKET_STATUSES = [
  'pending',
  'processing',
  'completed',
] as const;
export type ItTicketStatus = (typeof IT_TICKET_STATUSES)[number];

export const IT_TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type ItTicketCategory = (typeof IT_TICKET_CATEGORIES)[number];

/**
 * Static translation keys for the enumerated values. Written out rather than
 * built at runtime so the wording stays greppable and a coverage check can
 * find every key.
 */
export const IT_STATUS_LABEL_KEYS: Record<ItTicketStatus, string> = {
  pending: 'it.status.pending',
  processing: 'it.status.processing',
  completed: 'it.status.completed',
};

export const IT_CATEGORY_LABEL_KEYS: Record<ItTicketCategory, string> = {
  computer: 'it.category.computer',
  account: 'it.category.account',
  other: 'it.category.other',
};

/** The trimmed submitter/handler relation the endpoints return. */
export interface ItTicketPerson {
  readonly id: string;
  readonly name: string;
}

/** A ticket exactly as the endpoints serialize it; dates arrive as ISO strings. */
export interface ItTicket {
  readonly id: number;
  readonly title: string;
  readonly category: string;
  readonly description: string | null;
  readonly status: string;
  readonly resolution: string | null;
  readonly submitterId: string;
  readonly handlerId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly submitter?: ItTicketPerson | null;
  readonly handler?: ItTicketPerson | null;
}

/** Functions the list page passes to its child routes through `<Outlet context>`. */
export interface ItRequestsOutletContext {
  /** Refetches the list behind the overlay. */
  readonly reload: () => void;
}

export function isItTicketStatus(
  value: string | null,
): value is ItTicketStatus {
  return IT_TICKET_STATUSES.some((status) => status === value);
}

export function isItTicketCategory(
  value: string | null,
): value is ItTicketCategory {
  return IT_TICKET_CATEGORIES.some((category) => category === value);
}
