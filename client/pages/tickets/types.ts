/** The three categories an employee may choose from, in the order the form offers them. */
export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/** The lifecycle of a ticket: filed, being worked, then finished with a resolution. */
export const TICKET_STATUSES = ['pending', 'processing', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type TicketRole = 'employee' | 'handler' | 'admin';

/** One ticket as the server returns it. Timestamps are ISO strings. */
export interface Ticket {
  readonly id: string;
  readonly reference: string;
  readonly title: string;
  readonly category: TicketCategory;
  readonly description: string | null;
  readonly status: TicketStatus;
  readonly submitterId: string;
  readonly submitterName: string;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
  readonly resolution: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * What the caller may do, decided by the server from their permission sets.
 * `canProcess` is false for an employee, which is what keeps the start and
 * complete controls off their screen; the server refuses them anyway.
 */
export interface TicketMeta {
  readonly role: TicketRole;
  readonly canCreate: boolean;
  readonly canProcess: boolean;
}

export interface TicketListResult {
  readonly data: readonly Ticket[];
  readonly meta: TicketMeta;
}

export interface TicketResult {
  readonly data: Ticket;
  readonly meta: TicketMeta;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly category: TicketCategory;
  readonly description?: string;
}
