import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';

/**
 * Domain logic for the IT repair desk. The service knows nothing about HTTP or
 * Hono — it takes an already-resolved actor (the route decides who is calling)
 * and throws `TicketError` values the route maps onto status codes.
 *
 * The ticket fields are read and written as rows of the `tickets` collection
 * through the database-layer query builder, which applies the connection's
 * naming (so the camelCase fields here are the snake_case columns a DBA sees).
 * `submitterId`/`handlerId` are identifiers rather than relations on purpose:
 * the names the ticket recorded are what get displayed, so a reader never has
 * to reach into the `user` collection that employees may not read.
 */

export type TicketStatus = 'pending' | 'processing' | 'completed';
export type TicketCategory = 'computer' | 'account' | 'other';
export type TicketRole = 'employee' | 'handler' | 'admin';

export const TICKET_CATEGORIES: readonly TicketCategory[] = [
  'computer',
  'account',
  'other',
];
export const TICKET_STATUSES: readonly TicketStatus[] = [
  'pending',
  'processing',
  'completed',
];

export interface TicketActor {
  readonly userId: string;
  readonly userName: string;
  readonly role: TicketRole;
}

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

export interface CreateTicketInput {
  readonly title: string;
  readonly category: TicketCategory;
  readonly description?: string;
}

export type TicketErrorCode =
  | 'TICKET_NOT_FOUND'
  | 'TICKET_FORBIDDEN'
  | 'TICKET_INVALID_INPUT'
  | 'TICKET_RESOLUTION_REQUIRED'
  | 'TICKET_INVALID_STATUS';

export class TicketError extends Error {
  readonly code: TicketErrorCode;

  constructor(code: TicketErrorCode, message: string) {
    super(message);
    this.name = 'TicketError';
    this.code = code;
  }
}

export interface TicketService {
  list(
    actor: TicketActor,
    filter?: { status?: TicketStatus },
  ): Promise<Ticket[]>;
  get(actor: TicketActor, id: string): Promise<Ticket>;
  create(actor: TicketActor, input: CreateTicketInput): Promise<Ticket>;
  start(actor: TicketActor, id: string): Promise<Ticket>;
  complete(actor: TicketActor, id: string, resolution: string): Promise<Ticket>;
}

export const ticketServiceToken =
  createServiceToken<TicketService>('app/ticket-service');

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const RESOLUTION_MAX = 5000;

function isProcessor(actor: TicketActor): boolean {
  return actor.role === 'handler' || actor.role === 'admin';
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  // Only primitives have a faithful text form; an unexpected object is a
  // programming error and must not become the literal '[object Object]'.
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result.length === 0 ? null : result;
}

function iso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return text(value);
}

function nullableIso(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return iso(value);
}

function toTicket(row: Record<string, unknown>): Ticket {
  return {
    id: text(row.id),
    reference: text(row.reference),
    title: text(row.title),
    category: text(row.category) as TicketCategory,
    description: nullableText(row.description),
    status: text(row.status) as TicketStatus,
    submitterId: text(row.submitterId),
    submitterName: text(row.submitterName),
    handlerId: nullableText(row.handlerId),
    handlerName: nullableText(row.handlerName),
    resolution: nullableText(row.resolution),
    completedAt: nullableIso(row.completedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function referenceFor(id: string): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `TKT-${day}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function createTicketService(database: DatabaseManager): TicketService {
  async function load(
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    return database
      .query()
      .selectFrom('tickets')
      .selectAll()
      .where('id', '=', id)
      .limit(1)
      .executeTakeFirst<Record<string, unknown>>();
  }

  async function require(id: string): Promise<Ticket> {
    const row = await load(id);
    if (!row) {
      throw new TicketError('TICKET_NOT_FOUND', 'Ticket not found.');
    }
    return toTicket(row);
  }

  return {
    async list(actor, filter) {
      // `where` returns a new query, so each condition is chained rather than
      // written for its side effect: dropping the result would silently drop
      // both the employee's scope and the status filter.
      let query = database.query().selectFrom('tickets').selectAll();
      // An employee only ever reads their own rows; a handler (and an
      // administrator) reads every row. The scope is applied here, in the
      // query, not filtered afterwards in the browser.
      if (!isProcessor(actor)) {
        query = query.where('submitterId', '=', actor.userId);
      }
      if (filter?.status) {
        query = query.where('status', '=', filter.status);
      }
      const rows = await query
        .orderBy('createdAt', 'desc')
        .execute<Record<string, unknown>>();
      return rows.map(toTicket);
    },

    async get(actor, id) {
      const ticket = await require(id);
      // An employee asking for someone else's ticket is told it does not
      // exist, so a guessed URL reveals nothing about another colleague.
      if (!isProcessor(actor) && ticket.submitterId !== actor.userId) {
        throw new TicketError('TICKET_NOT_FOUND', 'Ticket not found.');
      }
      return ticket;
    },

    async create(actor, input) {
      const title = input.title?.trim() ?? '';
      if (title.length === 0) {
        throw new TicketError(
          'TICKET_INVALID_INPUT',
          'A ticket title is required.',
        );
      }
      if (title.length > TITLE_MAX) {
        throw new TicketError(
          'TICKET_INVALID_INPUT',
          `A ticket title may not exceed ${TITLE_MAX} characters.`,
        );
      }
      if (!TICKET_CATEGORIES.includes(input.category)) {
        throw new TicketError(
          'TICKET_INVALID_INPUT',
          'Choose one of the supported categories.',
        );
      }
      const description = input.description?.trim() ?? '';
      if (description.length > DESCRIPTION_MAX) {
        throw new TicketError(
          'TICKET_INVALID_INPUT',
          `A description may not exceed ${DESCRIPTION_MAX} characters.`,
        );
      }
      const id = crypto.randomUUID();
      const now = new Date();
      await database
        .query()
        .insertInto('tickets')
        .values({
          id,
          reference: referenceFor(id),
          title,
          category: input.category,
          description: description.length === 0 ? null : description,
          status: 'pending',
          submitterId: actor.userId,
          submitterName: actor.userName,
          handlerId: null,
          handlerName: null,
          resolution: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return require(id);
    },

    async start(actor, id) {
      const ticket = await require(id);
      if (!isProcessor(actor)) {
        throw new TicketError(
          'TICKET_FORBIDDEN',
          'Only an IT handler may start a ticket.',
        );
      }
      if (ticket.status !== 'pending') {
        throw new TicketError(
          'TICKET_INVALID_STATUS',
          'Only a pending ticket can be started.',
        );
      }
      await database
        .query()
        .updateTable('tickets')
        .set({
          status: 'processing',
          handlerId: actor.userId,
          handlerName: actor.userName,
          updatedAt: new Date(),
        })
        .where('id', '=', id)
        // The status predicate keeps a concurrent start from overwriting the
        // handler another request already claimed; the reload below reports
        // the conflict instead of pretending this caller won.
        .where('status', '=', 'pending')
        .execute();
      const started = await require(id);
      if (
        started.status !== 'processing' ||
        started.handlerId !== actor.userId
      ) {
        throw new TicketError(
          'TICKET_INVALID_STATUS',
          'Another handler has already started this ticket.',
        );
      }
      return started;
    },

    async complete(actor, id, resolution) {
      const ticket = await require(id);
      if (!isProcessor(actor)) {
        throw new TicketError(
          'TICKET_FORBIDDEN',
          'Only an IT handler may complete a ticket.',
        );
      }
      if (ticket.status !== 'processing') {
        throw new TicketError(
          'TICKET_INVALID_STATUS',
          'Only a ticket in progress can be completed.',
        );
      }
      const note = resolution?.trim() ?? '';
      if (note.length === 0) {
        throw new TicketError(
          'TICKET_RESOLUTION_REQUIRED',
          'A resolution note is required to complete a ticket.',
        );
      }
      if (note.length > RESOLUTION_MAX) {
        throw new TicketError(
          'TICKET_INVALID_INPUT',
          `A resolution may not exceed ${RESOLUTION_MAX} characters.`,
        );
      }
      await database
        .query()
        .updateTable('tickets')
        .set({
          status: 'completed',
          resolution: note,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where('id', '=', id)
        // A completed ticket is terminal: the status predicate makes a second
        // completion from a concurrent request a no-op rather than a rewrite.
        .where('status', '=', 'processing')
        .execute();
      return require(id);
    },
  };
}

export class TicketServiceProvider extends ServiceProvider<Application> {
  readonly name = 'app/ticket-service';

  register(): void {
    this.app.container.singleton(ticketServiceToken, (resolver) =>
      createTicketService(resolver.resolve(databaseManagerToken)),
    );
  }
}
