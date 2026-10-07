import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  databaseManagerToken,
  type DatabaseManager,
  type RepositoryPolicy,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

import {
  registerTicketResources,
  type TicketCategory,
  type TicketStatus,
} from '../tickets-resources.js';

/** A ticket as the API returns it, with the two people already resolved. */
export interface TicketView {
  id: number;
  title: string;
  category: string;
  description: string | null;
  status: string;
  resolution: string | null;
  submitterId: string;
  submitterName: string | null;
  handlerId: string | null;
  handlerName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTicketsQuery {
  status?: TicketStatus;
  page: number;
  pageSize: number;
}

export interface ListTicketsResult {
  items: TicketView[];
  total: number;
}

export interface CreateTicketInput {
  title: string;
  category: TicketCategory;
  description?: string | null;
  submitterId: string;
}

export class TicketNotFoundError extends Error {
  readonly reason = 'TICKET_NOT_FOUND';
  constructor(readonly ticketId: number) {
    super(`Ticket ${ticketId} was not found.`);
  }
}

export class TicketStateError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Ticket domain logic. It never reads a request context and never decides an
 * HTTP status: it accepts the authorization policy the route resolved and
 * binds it to the repository, so a record outside the caller's scope behaves
 * as if it did not exist.
 */
export class TicketService {
  constructor(private readonly database: DatabaseManager) {}

  async list(
    policy: RepositoryPolicy,
    query: ListTicketsQuery,
  ): Promise<ListTicketsResult> {
    const repository = this.database.repository('tickets').withPolicy(policy);
    const filter =
      query.status === undefined ? undefined : { status: query.status };
    const [rows, total] = await Promise.all([
      repository.findMany({
        filter,
        sort: (sort) => sort.field('createdAt').desc(),
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      }),
      repository.count({ filter }),
    ]);
    const items = await this.decorate(rows as unknown as TicketRecord[]);
    return { items, total };
  }

  async get(
    policy: RepositoryPolicy,
    id: number,
  ): Promise<TicketView | undefined> {
    const record = await this.database
      .repository('tickets')
      .withPolicy(policy)
      .findOne({ filter: { id } });
    if (!record) return undefined;
    const [view] = await this.decorate([record as unknown as TicketRecord]);
    return view;
  }

  async create(
    policy: RepositoryPolicy,
    input: CreateTicketInput,
  ): Promise<TicketView> {
    const now = new Date();
    const { record } = await this.database
      .repository('tickets')
      .withPolicy(policy)
      .createOne({
        values: {
          title: input.title,
          category: input.category,
          description: input.description ?? null,
          status: 'pending',
          submitterId: input.submitterId,
          createdAt: now,
          updatedAt: now,
        },
      });
    const [view] = await this.decorate([record as unknown as TicketRecord]);
    return view;
  }

  async start(
    policy: RepositoryPolicy,
    id: number,
    handlerId: string,
  ): Promise<TicketView> {
    const repository = this.database.repository('tickets').withPolicy(policy);
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) throw new TicketNotFoundError(id);
    if (existing.status !== 'pending') {
      throw new TicketStateError(
        'TICKET_ALREADY_STARTED',
        'Only a pending ticket can be started.',
      );
    }
    const now = new Date();
    const { record } = await repository.updateOne({
      filter: { id, status: 'pending' },
      values: {
        status: 'in_progress',
        handlerId,
        startedAt: now,
        updatedAt: now,
      },
    });
    const [view] = await this.decorate([record as unknown as TicketRecord]);
    return view;
  }

  async complete(
    policy: RepositoryPolicy,
    id: number,
    resolution: string,
  ): Promise<TicketView> {
    const repository = this.database.repository('tickets').withPolicy(policy);
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) throw new TicketNotFoundError(id);
    if (existing.status !== 'in_progress') {
      throw new TicketStateError(
        'TICKET_NOT_IN_PROGRESS',
        'Only a ticket that is being handled can be completed.',
      );
    }
    const now = new Date();
    const { record } = await repository.updateOne({
      filter: { id, status: 'in_progress' },
      values: {
        status: 'completed',
        resolution,
        completedAt: now,
        updatedAt: now,
      },
    });
    const [view] = await this.decorate([record as unknown as TicketRecord]);
    return view;
  }

  /** Resolve the submitter and handler display names in one query. */
  private async decorate(rows: readonly TicketRecord[]): Promise<TicketView[]> {
    const ids = new Set<string>();
    for (const row of rows) {
      if (typeof row.submitterId === 'string') ids.add(row.submitterId);
      if (typeof row.handlerId === 'string') ids.add(row.handlerId);
    }
    const names = await this.displayNames([...ids]);
    return rows.map((row) => {
      const submitterId = text(row.submitterId);
      const handlerId = textOrNull(row.handlerId);
      return {
        id: Number(row.id),
        title: text(row.title),
        category: text(row.category),
        description: textOrNull(row.description),
        status: text(row.status),
        resolution: textOrNull(row.resolution),
        submitterId,
        submitterName: names.get(submitterId) ?? null,
        handlerId,
        handlerName: handlerId === null ? null : (names.get(handlerId) ?? null),
        startedAt: iso(row.startedAt),
        completedAt: iso(row.completedAt),
        createdAt: iso(row.createdAt) ?? '',
        updatedAt: iso(row.updatedAt) ?? '',
      };
    });
  }

  private async displayNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (!ids.length) return names;
    const users = await this.database.repository('user').findMany({
      filter: (filter) =>
        filter.or(ids.map((id) => filter.string('id').eq(id))),
    });
    // `user` has no generated declaration the application owns, so its rows
    // arrive as generic records; the fields read here are the plugin's public ones.
    for (const user of users) {
      const id = text(user.id);
      const name =
        typeof user.name === 'string' && user.name.length
          ? user.name
          : typeof user.username === 'string'
            ? user.username
            : id;
      names.set(id, name);
    }
    return names;
  }
}

interface TicketRecord {
  id: number | string;
  title: unknown;
  category: unknown;
  description?: unknown;
  status: unknown;
  resolution?: unknown;
  submitterId: unknown;
  handlerId?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * A record field as text. Rows arrive from tables the application does not declare, so a field typed `unknown` is
 * narrowed here rather than stringified: `String(someObject)` would silently produce `[object Object]`.
 */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return '';
}

/** A nullable record field as text, `null` when the field holds nothing. */
function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return text(value);
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

export const ticketServiceToken = createServiceToken<TicketService>(
  'app/tickets-service',
);

/**
 * Registers the ticket collection, its composite actions and the ticket
 * service with the application.
 */
export class TicketsProvider extends ServiceProvider<Application> {
  readonly name = '@app/tickets';

  register(): void {
    this.app.container.singleton(
      ticketServiceToken,
      () => new TicketService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  async boot(): Promise<void> {
    // The ticket resources belong to the authorization plugin's service. An application that does not register that
    // plugin has no ticket access model, so there is nothing to declare.
    if (!this.app.container.has(authorizationToken)) return;
    registerTicketResources(this.app.container.resolve(authorizationToken));
  }
}
