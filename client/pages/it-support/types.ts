/** The ticket status values, in workflow order. */
export const IT_TICKET_STATUSES = [
  'pending',
  'processing',
  'completed',
] as const;

export type ItTicketStatus = (typeof IT_TICKET_STATUSES)[number];

/** The ticket categories the form offers. */
export const IT_TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;

export type ItTicketCategory = (typeof IT_TICKET_CATEGORIES)[number];

/** A ticket as `/api/it-tickets` returns it. */
export interface ItTicket {
  readonly id: number;
  readonly title: string;
  readonly category: string;
  readonly description: string | null;
  readonly status: string;
  readonly submitterId: string;
  readonly submitterName: string | null;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
  readonly resolution: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

/** What the current identity may do, decided by the server. */
export interface ItTicketCapabilities {
  readonly create: boolean;
  readonly start: boolean;
  readonly complete: boolean;
}

export interface ItTicketListResponse {
  readonly data: ItTicket[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly capabilities: ItTicketCapabilities;
}

export interface ItTicketDetailResponse {
  readonly data: ItTicket;
  readonly capabilities: ItTicketCapabilities;
}

/** Context the list page hands to its child routes. */
export interface ItSupportOutletContext {
  /** Reloads the list in the background after a change in a child route. */
  readonly reload: () => void;
}

/** Context the detail drawer hands to the complete dialog. */
export interface ItTicketDetailOutletContext {
  /** Shows the record the endpoint returned without waiting for a reload. */
  readonly onUpdated: (ticket: ItTicket) => void;
  /** The record no longer exists (or is not visible to this identity). */
  readonly onNotFound: () => void;
  /** Reloads the drawer's record when it changed underneath (for example another processor acted first). */
  readonly refresh: () => void;
}

export function isItTicketStatus(value: string): value is ItTicketStatus {
  return (IT_TICKET_STATUSES as readonly string[]).includes(value);
}

export function isItTicketCategory(value: string): value is ItTicketCategory {
  return (IT_TICKET_CATEGORIES as readonly string[]).includes(value);
}
