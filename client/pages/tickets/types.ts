import type { ResourceRef } from '@nocobase/app-plugin-authorization/client';

/**
 * The client's copy of the repair-ticket contract.
 *
 * The values mirror `server/tickets-resources.ts`. They are repeated rather
 * than imported because browser code must not pull in server modules; the
 * server validates every value it receives, so a drift here fails loudly at
 * the API instead of corrupting a row.
 */

export const REPAIR_TICKETS_RESOURCE = 'it.repairTickets';

export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export const TICKET_STATUSES = ['pending', 'processing', 'completed'] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** What `GET /api/tickets` and the single-ticket endpoints answer with. */
export interface TicketDto {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly description: string | null;
  readonly status: string;
  readonly resolution: string | null;
  readonly submitterId: string;
  readonly handlerId: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submitterName: string;
  readonly handlerName: string | null;
}

/** The composite resource an action is checked against. */
export function ticketResource(): ResourceRef {
  return { type: 'composite', id: REPAIR_TICKETS_RESOURCE };
}
