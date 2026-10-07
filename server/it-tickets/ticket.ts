/**
 * The IT repair ticket vocabulary, shared by the authorization declaration, the
 * service and the HTTP routes.
 *
 * The keys stored in the database are stable identifiers; every human-readable
 * wording lives in the client locale files and is looked up by these keys.
 */

/** The Collection that holds the tickets, as the migration declared it. */
export const IT_TICKETS_COLLECTION = 'itTickets';

export const IT_TICKET_STATUSES = [
  'pending',
  'processing',
  'completed',
] as const;

export type ItTicketStatus = (typeof IT_TICKET_STATUSES)[number];

export const IT_TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;

export type ItTicketCategory = (typeof IT_TICKET_CATEGORIES)[number];

/**
 * One row of `itTickets`, as the database stores it. Written out by hand so the
 * authorization declaration and the Repository calls agree on the shape; the
 * columns are the ones `202609200001_create_it_tickets` created.
 */
export interface ItTicketRow {
  id: string;
  title: string;
  category: string;
  description: string | null;
  status: string;
  resolutionNote: string | null;
  submitterId: string;
  submitterName: string;
  handlerId: string | null;
  handlerName: string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** What a create call may write: the ticket id and the timestamps are the server's. */
export type ItTicketCreate = Partial<ItTicketRow>;

/** What an update call may write. */
export type ItTicketUpdate = Partial<ItTicketRow>;

/** One ticket as the API returns it. */
export interface ItTicketDto {
  id: string;
  title: string;
  category: string;
  description: string | null;
  status: string;
  resolutionNote: string | null;
  submitterId: string;
  submitterName: string;
  handlerId: string | null;
  handlerName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const toIso = (value: Date | string | null | undefined): string =>
  value instanceof Date ? value.toISOString() : String(value ?? '');

const toIsoOrNull = (value: Date | string | null | undefined): string | null =>
  value === null || value === undefined ? null : toIso(value);

/**
 * A row a Repository returned, normalized to the API shape. A policy-bound read
 * can hand back a partial record, so every value is read defensively.
 */
export function toItTicketDto(row: Partial<ItTicketRow>): ItTicketDto {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    category: String(row.category ?? ''),
    description: row.description ?? null,
    status: String(row.status ?? ''),
    resolutionNote: row.resolutionNote ?? null,
    submitterId: String(row.submitterId ?? ''),
    submitterName: String(row.submitterName ?? ''),
    handlerId: row.handlerId ?? null,
    handlerName: row.handlerName ?? null,
    startedAt: toIsoOrNull(row.startedAt),
    completedAt: toIsoOrNull(row.completedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}
