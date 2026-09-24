import {
  RepositoryError,
  type DatabaseManager,
  type RepositoryPolicy,
  type UpdateMutationValues,
} from '@nocobase/db';
import type {
  AppAuthorizationService,
  AuthorizationScope,
} from '@nocobase/app-plugin-authorization';

import {
  TICKETS_COLLECTION,
  isTicketCategory,
  isTicketStatus,
  type TicketCategory,
  type TicketStatus,
} from '../../tickets-resources.js';

/** A raw row of the ticket table, as the Repository hands it back. */
interface TicketRecord {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  description?: unknown;
  submitterId?: unknown;
  handlerId?: unknown;
  status?: unknown;
  handlingNote?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Ticket {
  id: number;
  title: string;
  category: TicketCategory;
  description: string | null;
  submitterId: string;
  submitterName: string | null;
  handlerId: string | null;
  handlerName: string | null;
  status: TicketStatus;
  handlingNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What the caller may do with this collection.
 *
 * The server is the only authority for this: the browser is told so it can hide
 * actions the request would be refused for, and never to decide whether the
 * request is allowed.
 */
export interface TicketCapabilities {
  canCreate: boolean;
  canProcess: boolean;
}

export interface TicketList {
  data: Ticket[];
  meta: TicketCapabilities;
}

export interface CreateTicketInput {
  title: unknown;
  category: unknown;
  description?: unknown;
}

export interface TicketNoteInput {
  handlingNote?: unknown;
}

/** The statuses a ticket request can be refused with. */
export type TicketsErrorStatus = 400 | 403 | 404 | 409;

/**
 * A failure the route can turn into an HTTP response without inspecting it.
 *
 * Domain code raises one of these; it never chooses a status code itself.
 */
export class TicketsError extends Error {
  constructor(
    readonly status: TicketsErrorStatus,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TicketsError';
  }
}

const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_NOTE_LENGTH = 2000;

/**
 * The ticket lifecycle, expressed against the Repository.
 *
 * Every method takes the request's authorization scope instead of assuming one,
 * so the same code answers an employee and a handler and the difference lives
 * in the persisted permission sets rather than in a role check here.
 */
export class TicketsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: AppAuthorizationService,
  ) {}

  async list(scope: AuthorizationScope, status: unknown): Promise<TicketList> {
    let filter: { status: TicketStatus } | undefined;
    if (status !== undefined && status !== null && status !== '') {
      if (!isTicketStatus(status)) {
        throw new TicketsError(400, 'INVALID_STATUS', 'Unknown ticket status');
      }
      filter = { status };
    }

    const policy = await this.policyFor(scope);
    const records = (await this.repository(policy).findMany({
      ...(filter ? { filter } : {}),
      sort: (sort) => [sort.field('createdAt').desc(), sort.field('id').desc()],
    })) as unknown as TicketRecord[];

    return {
      data: await this.toTickets(records),
      meta: capabilities(policy),
    };
  }

  async get(scope: AuthorizationScope, id: unknown): Promise<Ticket> {
    const ticketId = requireTicketId(id);
    const policy = await this.policyFor(scope);
    const record = await this.findTicket(policy, ticketId);
    const [ticket] = await this.toTickets([record]);
    return ticket;
  }

  async create(
    scope: AuthorizationScope,
    submitterId: string,
    input: CreateTicketInput,
  ): Promise<Ticket> {
    const policy = await this.policyFor(scope);
    if (policy.create === false) {
      throw new TicketsError(403, 'FORBIDDEN', 'You may not create tickets');
    }

    const title = requireText(input.title, 'title', MAX_TITLE_LENGTH);
    if (!isTicketCategory(input.category)) {
      throw new TicketsError(
        400,
        'INVALID_CATEGORY',
        'Unknown ticket category',
      );
    }
    const description = optionalText(
      input.description,
      'description',
      MAX_DESCRIPTION_LENGTH,
    );

    // The submitter is the authenticated user, never something the client
    // sends. Status and timestamps are owned by the server for the same reason.
    const now = new Date();
    const result = await this.repository(policy).createOne({
      values: {
        title,
        category: input.category,
        description,
        submitterId,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    });
    const [ticket] = await this.toTickets([result.record]);
    return ticket;
  }

  async start(
    scope: AuthorizationScope,
    handlerId: string,
    id: unknown,
    input: TicketNoteInput,
  ): Promise<Ticket> {
    const ticketId = requireTicketId(id);
    const note = requireText(
      input.handlingNote,
      'handlingNote',
      MAX_NOTE_LENGTH,
    );
    const policy = await this.policyFor(scope);
    if (policy.update === false) {
      throw new TicketsError(403, 'FORBIDDEN', 'You may not handle tickets');
    }

    const existing = await this.findTicketForUpdate(policy, ticketId);
    if (existing.status !== 'pending') {
      throw new TicketsError(
        409,
        'INVALID_TRANSITION',
        'Only a pending ticket can be started',
      );
    }

    await this.transition(policy, ticketId, 'pending', {
      status: 'processing',
      handlerId,
      handlingNote: note,
      updatedAt: new Date(),
    });
    return this.get(scope, ticketId);
  }

  async complete(
    scope: AuthorizationScope,
    id: unknown,
    input: TicketNoteInput,
  ): Promise<Ticket> {
    const ticketId = requireTicketId(id);
    const policy = await this.policyFor(scope);
    if (policy.update === false) {
      throw new TicketsError(403, 'FORBIDDEN', 'You may not handle tickets');
    }

    const existing = await this.findTicketForUpdate(policy, ticketId);
    if (existing.status !== 'processing') {
      throw new TicketsError(
        409,
        'INVALID_TRANSITION',
        'Only a ticket in progress can be completed',
      );
    }

    // A completed ticket keeps the note it was started with unless the handler
    // writes a final one now.
    const note =
      input.handlingNote === undefined || input.handlingNote === null
        ? existing.handlingNote
        : requireText(input.handlingNote, 'handlingNote', MAX_NOTE_LENGTH);
    if (!note) {
      throw new TicketsError(
        400,
        'MISSING_NOTE',
        'A handling note is required to complete a ticket',
      );
    }

    await this.transition(policy, ticketId, 'processing', {
      status: 'completed',
      handlingNote: note,
      updatedAt: new Date(),
    });
    return this.get(scope, ticketId);
  }

  private policyFor(scope: AuthorizationScope): Promise<RepositoryPolicy> {
    return this.authorization.db.policyFor(TICKETS_COLLECTION, scope);
  }

  private repository(policy: RepositoryPolicy) {
    return this.database.repository(TICKETS_COLLECTION).withPolicy(policy);
  }

  /** Read a ticket through the read decision the caller actually holds. */
  private async findTicket(
    policy: RepositoryPolicy,
    ticketId: number,
  ): Promise<TicketRecord> {
    const record = (await this.repository(policy).findOne({
      filter: { id: ticketId },
    })) as unknown as TicketRecord | undefined;
    if (!record) {
      throw ticketNotFound();
    }
    return record;
  }

  /**
   * Read a ticket that is about to be updated.
   *
   * The update decision is checked before the row is read, so an employee is
   * refused without learning whether the ticket exists.
   */
  private async findTicketForUpdate(
    policy: RepositoryPolicy,
    ticketId: number,
  ): Promise<{ status: TicketStatus; handlingNote: string | null }> {
    const record = await this.findTicket(policy, ticketId);
    return {
      status: isTicketStatus(record.status) ? record.status : 'pending',
      handlingNote: asString(record.handlingNote),
    };
  }

  private async transition(
    policy: RepositoryPolicy,
    ticketId: number,
    from: TicketStatus,
    values: UpdateMutationValues<TicketRecord>,
  ): Promise<void> {
    try {
      // The expected status is part of the filter so two handlers racing on one
      // ticket cannot both advance it; the loser updates no row.
      await this.repository(policy).updateOne({
        filter: { id: ticketId, status: from },
        values,
      });
    } catch (error) {
      if (
        error instanceof RepositoryError &&
        error.code === 'RECORD_NOT_FOUND'
      ) {
        throw new TicketsError(
          409,
          'INVALID_TRANSITION',
          'The ticket moved to another state while it was being handled',
        );
      }
      throw error;
    }
  }

  private async toTickets(records: readonly TicketRecord[]): Promise<Ticket[]> {
    const ids = new Set<string>();
    for (const record of records) {
      const submitterId = asString(record.submitterId);
      const handlerId = asString(record.handlerId);
      if (submitterId) {
        ids.add(submitterId);
      }
      if (handlerId) {
        ids.add(handlerId);
      }
    }
    const names = await this.displayNames([...ids]);
    return records.map((record) => {
      const submitterId = asString(record.submitterId) ?? '';
      const handlerId = asString(record.handlerId);
      return {
        id: asNumber(record.id),
        title: asString(record.title) ?? '',
        category: isTicketCategory(record.category) ? record.category : 'other',
        description: asString(record.description),
        submitterId,
        submitterName: names.get(submitterId) ?? null,
        handlerId,
        handlerName: handlerId ? (names.get(handlerId) ?? null) : null,
        status: isTicketStatus(record.status) ? record.status : 'pending',
        handlingNote: asString(record.handlingNote),
        createdAt: asIsoString(record.createdAt),
        updatedAt: asIsoString(record.updatedAt),
      };
    });
  }

  private async displayNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.database
      .connection()
      .query.selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', ids)
      .execute();
    return new Map(
      rows.map((row) => [
        String(row.id),
        asString(row.name) ?? asString(row.username) ?? String(row.id),
      ]),
    );
  }
}

function capabilities(policy: RepositoryPolicy): TicketCapabilities {
  return {
    canCreate: policy.create !== false,
    canProcess: policy.update !== false,
  };
}

function ticketNotFound(): TicketsError {
  return new TicketsError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
}

function requireTicketId(value: unknown): number {
  const id = typeof value === 'string' ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw ticketNotFound();
  }
  return id;
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TicketsError(400, 'INVALID_INPUT', `${field} is required`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new TicketsError(400, 'INVALID_INPUT', `${field} is too long`);
  }
  return text;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return requireText(value, field, maxLength);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function asIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : new Date(0).toISOString();
}
