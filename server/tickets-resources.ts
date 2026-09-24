/**
 * The names the ticket feature's authorization model is built from.
 *
 * The collection, the page, the record-access strategy and the business
 * category and status values are named once here, so the provider that
 * registers the model, the routes that enforce it and the page that reads it
 * cannot drift apart. The persisted grant's field allowlists are written out in
 * the seed that installs them instead, because a seed is a record of what was
 * granted at one point and must not follow a later change to this list.
 *
 * This module is deliberately free of database access and of any import that
 * would make it unusable from a seed's restricted context.
 */

export const TICKETS_COLLECTION = 'tickets';
export const TICKETS_PAGE = 'tickets';

/**
 * Record-access strategy: a user sees the tickets they submitted.
 *
 * The built-in `recordsIOwn` strategy is not reused because it is keyed to
 * `ownerId`; the ticket table names the column `submitterId`.
 */
export const TICKETS_SUBMITTED_SCOPE = 'tickets.submitted';

export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export const TICKET_STATUSES = ['pending', 'processing', 'completed'] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isTicketCategory(value: unknown): value is TicketCategory {
  return TICKET_CATEGORIES.includes(value as TicketCategory);
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return TICKET_STATUSES.includes(value as TicketStatus);
}
