/**
 * Pure business rules for IT repair tickets.
 *
 * This module never imports a database, an HTTP framework or an authorization
 * service, so the rules can be unit tested on their own and reused by the
 * service and the route. HTTP status codes are deliberately absent: the route
 * maps `ItTicketError.code` to a response.
 */

export const IT_TICKET_COLLECTION = 'itTickets';
export const IT_TICKET_RESOURCE = 'it.tickets';
export const IT_TICKET_PAGE = 'it.tickets';

export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_TITLE_MAX_LENGTH = 200;
export const TICKET_DESCRIPTION_MAX_LENGTH = 5000;
export const TICKET_RESOLUTION_MAX_LENGTH = 5000;

/**
 * A row of the `itTickets` collection. Scalar `ownerId` / `handlerId` keep the
 * migration self-contained; names are joined at read time.
 */
export interface ItTicketRow {
  readonly id: string;
  readonly title: string;
  readonly category: TicketCategory;
  readonly description: string;
  readonly status: TicketStatus;
  readonly ownerId: string;
  readonly handlerId: string | null;
  readonly resolution: string | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A ticket with the display names resolved from the `user` table. */
export interface ItTicketView extends ItTicketRow {
  readonly ownerName: string | null;
  readonly handlerName: string | null;
}

export type ItTicketErrorCode =
  | 'INVALID_TITLE'
  | 'INVALID_CATEGORY'
  | 'INVALID_DESCRIPTION'
  | 'INVALID_RESOLUTION'
  | 'INVALID_FILTER'
  | 'TICKET_COMPLETED'
  | 'INVALID_TRANSITION'
  | 'FORBIDDEN'
  | 'NOT_FOUND';

/** A business rule rejected the request. `code` is the machine-readable reason. */
export class ItTicketError extends Error {
  public readonly code: ItTicketErrorCode;

  public constructor(code: ItTicketErrorCode, message: string) {
    super(message);
    this.name = 'ItTicketError';
    this.code = code;
  }
}

export function isTicketCategory(value: unknown): value is TicketCategory {
  return (
    typeof value === 'string' &&
    (TICKET_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === 'string' &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

/** A status filter supplied by the client. An absent value means "every status". */
export function normalizeStatusFilter(
  value: unknown,
): TicketStatus | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (!isTicketStatus(value)) {
    throw new ItTicketError(
      'INVALID_FILTER',
      `The status filter must be one of: ${TICKET_STATUSES.join(', ')}.`,
    );
  }
  return value;
}

export function normalizeTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ItTicketError('INVALID_TITLE', 'A ticket title is required.');
  }
  const title = value.trim();
  if (title.length === 0) {
    throw new ItTicketError('INVALID_TITLE', 'A ticket title is required.');
  }
  if (title.length > TICKET_TITLE_MAX_LENGTH) {
    throw new ItTicketError(
      'INVALID_TITLE',
      `The ticket title may not exceed ${TICKET_TITLE_MAX_LENGTH} characters.`,
    );
  }
  return title;
}

export function normalizeCategory(value: unknown): TicketCategory {
  if (!isTicketCategory(value)) {
    throw new ItTicketError(
      'INVALID_CATEGORY',
      `The category must be one of: ${TICKET_CATEGORIES.join(', ')}.`,
    );
  }
  return value;
}

export function normalizeDescription(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ItTicketError(
      'INVALID_DESCRIPTION',
      'A problem description is required.',
    );
  }
  const description = value.trim();
  if (description.length === 0) {
    throw new ItTicketError(
      'INVALID_DESCRIPTION',
      'A problem description is required.',
    );
  }
  if (description.length > TICKET_DESCRIPTION_MAX_LENGTH) {
    throw new ItTicketError(
      'INVALID_DESCRIPTION',
      `The problem description may not exceed ${TICKET_DESCRIPTION_MAX_LENGTH} characters.`,
    );
  }
  return description;
}

export function normalizeResolution(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ItTicketError(
      'INVALID_RESOLUTION',
      'A handling note is required before a ticket can be completed.',
    );
  }
  const resolution = value.trim();
  if (resolution.length === 0) {
    throw new ItTicketError(
      'INVALID_RESOLUTION',
      'A handling note is required before a ticket can be completed.',
    );
  }
  if (resolution.length > TICKET_RESOLUTION_MAX_LENGTH) {
    throw new ItTicketError(
      'INVALID_RESOLUTION',
      `The handling note may not exceed ${TICKET_RESOLUTION_MAX_LENGTH} characters.`,
    );
  }
  return resolution;
}

/** A completed ticket is final: it may not be started, edited or completed again. */
export function assertNotCompleted(ticket: Pick<ItTicketRow, 'status'>): void {
  if (ticket.status === 'completed') {
    throw new ItTicketError(
      'TICKET_COMPLETED',
      'A completed ticket can no longer be changed.',
    );
  }
}

/** Only a pending ticket can start being handled. */
export function assertCanStart(ticket: Pick<ItTicketRow, 'status'>): void {
  assertNotCompleted(ticket);
  if (ticket.status !== 'pending') {
    throw new ItTicketError(
      'INVALID_TRANSITION',
      'Only a pending ticket can be started.',
    );
  }
}

/** Only a ticket that is being handled can be completed. */
export function assertCanComplete(ticket: Pick<ItTicketRow, 'status'>): void {
  assertNotCompleted(ticket);
  if (ticket.status !== 'in_progress') {
    throw new ItTicketError(
      'INVALID_TRANSITION',
      'Only a ticket in progress can be completed.',
    );
  }
}
