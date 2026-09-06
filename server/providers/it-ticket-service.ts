import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type ExpressionFactory,
  type Row,
  type SqlBool,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

// `create-app` rewrites this literal to the generated application's own package name. Keeping it alone on one short
// line means the rewrite cannot change how Prettier wraps the statements that use it: a shorter name would otherwise
// let a wrapped call collapse onto one line, leaving the generated project failing its own `pnpm format:check`.
const APP_PACKAGE_NAME = '@nocobase/app-template-default';

export const TICKET_CATEGORIES = [
  'hardware',
  'software',
  'network',
  'account',
  'other',
] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_STATUSES = [
  'pending',
  'inProgress',
  'resolved',
  'closed',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Allowed status transitions in the ticket lifecycle. */
export const STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> =
  {
    pending: ['inProgress', 'closed'],
    inProgress: ['resolved', 'pending'],
    resolved: ['closed', 'inProgress'],
    closed: ['pending'],
  };

export function isTicketCategory(value: unknown): value is TicketCategory {
  return (
    typeof value === 'string' &&
    (TICKET_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isTicketPriority(value: unknown): value is TicketPriority {
  return (
    typeof value === 'string' &&
    (TICKET_PRIORITIES as readonly string[]).includes(value)
  );
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === 'string' &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

export function nextStatuses(status: TicketStatus): readonly TicketStatus[] {
  return STATUS_TRANSITIONS[status];
}

/** Raw ticket row as stored in the `itTickets` table. */
export interface ItTicket {
  id: number;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requesterId: string;
  assigneeId: string | null;
  resolution: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Ticket enriched with the display names of requester and assignee. */
export interface ItTicketView extends ItTicket {
  requesterName: string;
  assigneeName: string | null;
}

export interface ItTicketListQuery {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  assigneeId?: string;
  requesterId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ItTicketListResult {
  items: ItTicketView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ItTicketCreateInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
}

export interface ItTicketUpdateInput {
  title?: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  assigneeId?: string | null;
  resolution?: string | null;
}

export class TicketNotFoundError extends Error {
  constructor(readonly ticketId: number) {
    super(`Ticket ${ticketId} was not found.`);
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(
    readonly from: TicketStatus,
    readonly to: TicketStatus,
  ) {
    super(`Cannot move a ticket from ${from} to ${to}.`);
  }
}

export class AssigneeNotFoundError extends Error {
  constructor(readonly assigneeId: string) {
    super(`User ${assigneeId} does not exist.`);
  }
}

export interface AssigneeCandidate {
  id: string;
  name: string;
  email: string;
}

export interface ItTicketService {
  list(query: ItTicketListQuery): Promise<ItTicketListResult>;
  getById(id: number): Promise<ItTicketView>;
  create(
    input: ItTicketCreateInput,
    requesterId: string,
  ): Promise<ItTicketView>;
  update(id: number, input: ItTicketUpdateInput): Promise<ItTicketView>;
  assigneeCandidates(): Promise<AssigneeCandidate[]>;
}

export const itTicketServiceToken: ServiceToken<ItTicketService> =
  createServiceToken<ItTicketService>(`${APP_PACKAGE_NAME}/it-ticket-service`);

const TICKET_COLUMNS = [
  'itTickets.id',
  'itTickets.title',
  'itTickets.description',
  'itTickets.category',
  'itTickets.priority',
  'itTickets.status',
  'itTickets.requesterId',
  'itTickets.assigneeId',
  'itTickets.resolution',
  'itTickets.createdAt',
  'itTickets.updatedAt',
  'requester.name as requesterName',
  'assignee.name as assigneeName',
] as const;

export class ItTicketServiceImpl implements ItTicketService {
  constructor(private readonly database: DatabaseManager) {}

  async list(query: ItTicketListQuery): Promise<ItTicketListResult> {
    const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
    const requestedPageSize = Math.trunc(query.pageSize ?? 20) || 20;
    const pageSize = Math.min(100, Math.max(1, requestedPageSize));
    const where = this.buildFilter(query);

    const totalRow = await this.database
      .query()
      .selectFrom('itTickets')
      .select((eb) => [eb.fn.countAll().as('total')])
      .where(where)
      .executeTakeFirst();
    const total = Number(totalRow?.total ?? 0);

    const rows = await this.database
      .query()
      .selectFrom('itTickets')
      .select([...TICKET_COLUMNS])
      .leftJoin('user as requester', (join) =>
        join.onRef('requester.id', '=', 'itTickets.requesterId'),
      )
      .leftJoin('user as assignee', (join) =>
        join.onRef('assignee.id', '=', 'itTickets.assigneeId'),
      )
      .where(where)
      .orderBy('itTickets.createdAt', 'desc')
      .orderBy('itTickets.id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();

    return {
      items: rows.map((row) => this.toView(row)),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: number): Promise<ItTicketView> {
    const row = await this.database
      .query()
      .selectFrom('itTickets')
      .select([...TICKET_COLUMNS])
      .leftJoin('user as requester', (join) =>
        join.onRef('requester.id', '=', 'itTickets.requesterId'),
      )
      .leftJoin('user as assignee', (join) =>
        join.onRef('assignee.id', '=', 'itTickets.assigneeId'),
      )
      .where('itTickets.id', '=', id)
      .executeTakeFirst();

    if (!row) {
      throw new TicketNotFoundError(id);
    }

    return this.toView(row);
  }

  async create(
    input: ItTicketCreateInput,
    requesterId: string,
  ): Promise<ItTicketView> {
    const now = new Date();
    const result = await this.database
      .query()
      .insertInto('itTickets')
      .values({
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
        status: 'pending',
        requesterId,
        assigneeId: null,
        resolution: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const id = Number(result.insertId ?? result.rows?.[0]?.id);
    if (!Number.isFinite(id)) {
      throw new Error('Ticket insert did not return an id.');
    }

    return this.getById(id);
  }

  async update(id: number, input: ItTicketUpdateInput): Promise<ItTicketView> {
    const current = await this.database
      .query()
      .selectFrom('itTickets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!current) {
      throw new TicketNotFoundError(id);
    }

    const currentStatus = current.status as TicketStatus;
    const nextStatus = input.status ?? currentStatus;
    if (
      nextStatus !== currentStatus &&
      !STATUS_TRANSITIONS[currentStatus].includes(nextStatus)
    ) {
      throw new InvalidStatusTransitionError(currentStatus, nextStatus);
    }

    if (input.assigneeId !== undefined && input.assigneeId !== null) {
      const assignee = await this.database
        .query()
        .selectFrom('user')
        .select('id')
        .where('id', '=', input.assigneeId)
        .executeTakeFirst();
      if (!assignee) {
        throw new AssigneeNotFoundError(input.assigneeId);
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined)
      updates.description = input.description;
    if (input.category !== undefined) updates.category = input.category;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.status !== undefined) updates.status = input.status;
    if (input.resolution !== undefined) updates.resolution = input.resolution;
    if (input.assigneeId !== undefined) {
      updates.assigneeId = input.assigneeId;
    }

    await this.database
      .query()
      .updateTable('itTickets')
      .set(updates)
      .where('id', '=', id)
      .execute();

    return this.getById(id);
  }

  /** Everyone with an account is a possible assignee in this internal desk. */
  async assigneeCandidates(): Promise<AssigneeCandidate[]> {
    const rows = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'email'])
      .orderBy('name', 'asc')
      .execute();

    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      email: String(row.email),
    }));
  }

  private buildFilter(query: ItTicketListQuery): ExpressionFactory<SqlBool> {
    const conditions: ExpressionFactory<SqlBool>[] = [];
    if (query.status) {
      conditions.push((eb) => eb('status', '=', query.status));
    }
    if (query.priority) {
      conditions.push((eb) => eb('priority', '=', query.priority));
    }
    if (query.category) {
      conditions.push((eb) => eb('category', '=', query.category));
    }
    if (query.assigneeId) {
      conditions.push((eb) => eb('assigneeId', '=', query.assigneeId));
    }
    if (query.requesterId) {
      conditions.push((eb) => eb('requesterId', '=', query.requesterId));
    }
    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      conditions.push((eb) =>
        eb.or([eb('title', 'like', term), eb('description', 'like', term)]),
      );
    }
    return (eb) => eb.and(conditions);
  }

  private toView(row: Row): ItTicketView {
    return {
      id: Number(row.id),
      title: rowText(row.title),
      description: rowText(row.description),
      category: row.category as TicketCategory,
      priority: row.priority as TicketPriority,
      status: row.status as TicketStatus,
      requesterId: rowText(row.requesterId),
      assigneeId: rowNullableText(row.assigneeId),
      resolution: rowNullableText(row.resolution),
      createdAt: row.createdAt as Date | string,
      updatedAt: row.updatedAt as Date | string,
      requesterName: rowText(row.requesterName),
      assigneeName: rowNullableText(row.assigneeName),
    };
  }
}

/**
 * Coerce a raw database value to a string without falling back to Object's
 * default stringification for unexpected shapes.
 */
function rowText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function rowNullableText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return rowText(value);
}

export default class ItTicketServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = `${APP_PACKAGE_NAME}/it-ticket-service-provider`;

  public override register(): void {
    this.app.container.singleton(itTicketServiceToken, (container) => {
      const database = container.resolve(databaseManagerToken);
      return new ItTicketServiceImpl(database);
    });
  }
}
