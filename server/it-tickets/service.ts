/**
 * The IT repair ticket service.
 *
 * HTTP concerns stay in the route: this module takes the request's
 * authorization context, resolves the business decision once, and binds the
 * resulting per-collection policies to the repositories it reads and writes.
 * It never reads a Hono context, returns a status code or decides retries.
 */
import { randomUUID } from 'node:crypto';

import {
  IT_TICKET_COLLECTION,
  IT_TICKET_RESOURCE,
  ItTicketError,
  type ItTicketRow,
  type ItTicketView,
  type TicketCategory,
  type TicketStatus,
  assertCanComplete,
  assertCanStart,
  normalizeCategory,
  normalizeDescription,
  normalizeResolution,
  normalizeStatusFilter,
  normalizeTitle,
} from './domain.js';

import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type {
  DatabaseConnection,
  DatabaseManager,
  RepositoryPolicy,
  RepositoryRecord,
} from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

export interface ListItTicketsFilter {
  readonly status?: unknown;
}

export interface CreateItTicketInput {
  readonly title?: unknown;
  readonly category?: unknown;
  readonly description?: unknown;
}

export interface ItTicketService {
  list(
    authorization: AuthorizationContext,
    filter?: ListItTicketsFilter,
  ): Promise<ItTicketView[]>;
  detail(
    authorization: AuthorizationContext,
    id: string,
  ): Promise<ItTicketView>;
  create(
    authorization: AuthorizationContext,
    input: CreateItTicketInput,
  ): Promise<ItTicketView>;
  start(authorization: AuthorizationContext, id: string): Promise<ItTicketView>;
  complete(
    authorization: AuthorizationContext,
    id: string,
    resolution: unknown,
  ): Promise<ItTicketView>;
}

export const itTicketServiceToken = createServiceToken<ItTicketService>(
  'nb3-factory/it-tickets',
);

/** Listed tickets are capped; the client is a work queue, not an export. */
const LIST_LIMIT = 500;

function principalId(authorization: AuthorizationContext): string {
  return authorization.identity.principal.id;
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

/**
 * Read a scalar column as text. The database is trusted, so an unexpected
 * shape is rendered empty rather than throwing while a row is read.
 */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

/** Read a Repository record into the domain shape. Database values are trusted. */
function toRow(record: RepositoryRecord): ItTicketRow {
  return {
    id: text(record.id),
    title: text(record.title),
    category: text(record.category) as TicketCategory,
    description: text(record.description),
    status: text(record.status) as TicketStatus,
    ownerId: text(record.ownerId),
    handlerId: record.handlerId == null ? null : text(record.handlerId),
    resolution: record.resolution == null ? null : text(record.resolution),
    startedAt: record.startedAt == null ? null : toDate(record.startedAt),
    completedAt: record.completedAt == null ? null : toDate(record.completedAt),
    createdAt: toDate(record.createdAt),
    updatedAt: toDate(record.updatedAt),
  };
}

export class ItTicketServiceImplementation implements ItTicketService {
  public constructor(private readonly database: DatabaseManager) {}

  public async list(
    authorization: AuthorizationContext,
    filter?: ListItTicketsFilter,
  ): Promise<ItTicketView[]> {
    const status = normalizeStatusFilter(filter?.status);
    const policy = await this.policy(authorization, 'view');
    const connection = this.database.connection();
    const records = await connection
      .repository(IT_TICKET_COLLECTION)
      .withPolicy(policy)
      .findMany({
        filter: status ? { status } : undefined,
        sort: (sort) => [
          sort.field('createdAt').desc(),
          sort.field('id').desc(),
        ],
        limit: LIST_LIMIT,
      });
    return this.enrich(connection, records.map(toRow));
  }

  public async detail(
    authorization: AuthorizationContext,
    id: string,
  ): Promise<ItTicketView> {
    const policy = await this.policy(authorization, 'view');
    const connection = this.database.connection();
    const record = await connection
      .repository(IT_TICKET_COLLECTION)
      .withPolicy(policy)
      .findOne({ filter: { id } });
    if (!record) {
      throw new ItTicketError('NOT_FOUND', 'Ticket not found.');
    }
    const [view] = await this.enrich(connection, [toRow(record)]);
    return view;
  }

  public async create(
    authorization: AuthorizationContext,
    input: CreateItTicketInput,
  ): Promise<ItTicketView> {
    const title = normalizeTitle(input?.title);
    const category = normalizeCategory(input?.category);
    const description = normalizeDescription(input?.description);
    const ownerId = principalId(authorization);
    const policy = await this.policy(authorization, 'create');
    const now = new Date();

    const record = await this.database.transaction(async (connection) => {
      const created = await connection
        .repository(IT_TICKET_COLLECTION)
        .withPolicy(policy)
        .createOne({
          values: {
            id: randomUUID(),
            title,
            category,
            description,
            status: 'pending',
            ownerId,
            handlerId: null,
            resolution: null,
            startedAt: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        });
      return created.record;
    });

    const [view] = await this.enrich(this.database.connection(), [
      toRow(record),
    ]);
    return view;
  }

  public async start(
    authorization: AuthorizationContext,
    id: string,
  ): Promise<ItTicketView> {
    const policy = await this.policy(authorization, 'start');
    const handlerId = principalId(authorization);
    const now = new Date();

    const record = await this.database.transaction(async (connection) => {
      const repository = connection
        .repository(IT_TICKET_COLLECTION)
        .withPolicy(policy);
      const current = await repository.findOne({ filter: { id } });
      if (!current) {
        throw new ItTicketError('NOT_FOUND', 'Ticket not found.');
      }
      assertCanStart(toRow(current));
      const updated = await repository.updateOne({
        // The expected state is part of the predicate, so a concurrent change
        // fails instead of being retried as an unconditional write.
        filter: { id, status: 'pending' },
        values: {
          status: 'in_progress',
          handlerId,
          startedAt: now,
          updatedAt: now,
        },
      });
      return updated.record;
    });

    const [view] = await this.enrich(this.database.connection(), [
      toRow(record),
    ]);
    return view;
  }

  public async complete(
    authorization: AuthorizationContext,
    id: string,
    resolution: unknown,
  ): Promise<ItTicketView> {
    const note = normalizeResolution(resolution);
    const policy = await this.policy(authorization, 'complete');
    const now = new Date();

    const record = await this.database.transaction(async (connection) => {
      const repository = connection
        .repository(IT_TICKET_COLLECTION)
        .withPolicy(policy);
      const current = await repository.findOne({ filter: { id } });
      if (!current) {
        throw new ItTicketError('NOT_FOUND', 'Ticket not found.');
      }
      assertCanComplete(toRow(current));
      const updated = await repository.updateOne({
        filter: { id, status: 'in_progress' },
        values: {
          status: 'completed',
          resolution: note,
          completedAt: now,
          updatedAt: now,
        },
      });
      return updated.record;
    });

    const [view] = await this.enrich(this.database.connection(), [
      toRow(record),
    ]);
    return view;
  }

  /** Resolve one business action and return the policy for its one collection. */
  private async policy(
    authorization: AuthorizationContext,
    action: 'view' | 'create' | 'start' | 'complete',
  ): Promise<RepositoryPolicy> {
    const decision = await authorization.authorize({
      resource: { type: 'composite', id: IT_TICKET_RESOURCE },
      action,
    });
    const policy = decision.conditions?.database?.[IT_TICKET_COLLECTION];
    if (decision.effect === 'deny' || !policy) {
      throw new ItTicketError(
        'FORBIDDEN',
        'You are not allowed to perform this action.',
      );
    }
    return policy;
  }

  /**
   * Attach the submitter and handler display names. Only users the tickets
   * already reference are looked up, so this never widens what the reader may
   * see.
   */
  private async enrich(
    connection: DatabaseConnection,
    rows: readonly ItTicketRow[],
  ): Promise<ItTicketView[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.ownerId);
      if (row.handlerId) {
        ids.add(row.handlerId);
      }
    }
    const users = await connection.query
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', [...ids])
      .execute();
    const names = new Map<string, string>();
    for (const user of users) {
      const name =
        typeof user.name === 'string' && user.name.trim()
          ? user.name
          : typeof user.username === 'string'
            ? user.username
            : null;
      if (name) {
        names.set(String(user.id), name);
      }
    }
    return rows.map((row) => ({
      ...row,
      ownerName: names.get(row.ownerId) ?? null,
      handlerName: row.handlerId ? (names.get(row.handlerId) ?? null) : null,
    }));
  }
}
