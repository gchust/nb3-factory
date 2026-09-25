import type { PermissionSetsApi } from '@nocobase/app-plugin-authorization/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

import {
  IT_TICKET_CATEGORIES,
  IT_TICKET_HANDLER_SET,
  type ItTicketCategory,
  type ItTicketStatus,
} from './it-tickets-constants.js';

/** The row shape the `itTickets` table resolves to. */
export interface ItTicketRecord {
  id: number;
  title: string;
  category: string;
  description: string | null;
  submitterId: string;
  handlerId: string | null;
  status: string;
  resolutionNote: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

/** A ticket as the client sees it, with the people's names resolved. */
export interface ItTicketView {
  id: number;
  title: string;
  category: ItTicketCategory;
  description: string | null;
  submitterId: string;
  submitterName: string | null;
  handlerId: string | null;
  handlerName: string | null;
  status: ItTicketStatus;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ItTicketRole = 'employee' | 'handler';

export interface CreateItTicketInput {
  title?: unknown;
  category?: unknown;
  description?: unknown;
}

/** Thrown when the request is well formed but the operation is not allowed. */
export class ItTicketError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ItTicketError';
  }
}

export class ItTicketValidationError extends ItTicketError {
  constructor(code: string, message: string) {
    super(code, 400, message);
    this.name = 'ItTicketValidationError';
  }
}

export class ItTicketNotFoundError extends ItTicketError {
  constructor() {
    super('IT_TICKET_NOT_FOUND', 404, 'The ticket does not exist.');
    this.name = 'ItTicketNotFoundError';
  }
}

export class ItTicketForbiddenError extends ItTicketError {
  constructor() {
    super('IT_TICKET_FORBIDDEN', 403, 'You cannot access this ticket.');
    this.name = 'ItTicketForbiddenError';
  }
}

export class ItTicketStateError extends ItTicketError {
  constructor() {
    super(
      'IT_TICKET_INVALID_STATE',
      409,
      'The ticket is not in a state that allows this operation.',
    );
    this.name = 'ItTicketStateError';
  }
}

/** The slice of the permission-set API this feature needs, so it can be faked in tests. */
export type ItTicketRoleReader = Pick<
  PermissionSetsApi,
  'unrestricted' | 'getEffective'
>;

/**
 * A user is a handler when they hold an unrestricted set (a superuser) or the
 * handler Permission Set. Everyone else who is signed in is an employee.
 */
export async function resolveItTicketRole(
  permissionSets: ItTicketRoleReader,
  userId: string,
): Promise<ItTicketRole> {
  const identity = {
    principal: { type: 'user', id: userId },
    subjects: [{ type: 'authenticated', id: '*' }],
  };
  // Root and every other unrestricted set act as handlers: an administrator
  // manages the whole queue, not just their own tickets.
  if (await permissionSets.unrestricted(identity)) {
    return 'handler';
  }
  const effective = await permissionSets.getEffective(identity);
  return effective.some((set) => set.key === IT_TICKET_HANDLER_SET)
    ? 'handler'
    : 'employee';
}

export class ItTicketService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly permissionSets: ItTicketRoleReader,
  ) {}

  async resolveRole(userId: string): Promise<ItTicketRole> {
    return resolveItTicketRole(this.permissionSets, userId);
  }

  async list(
    userId: string,
    role: ItTicketRole,
    status?: ItTicketStatus,
  ): Promise<ItTicketView[]> {
    let query = this.database.query().selectFrom('itTickets');
    if (role === 'employee') {
      query = query.where('submitterId', '=', userId);
    }
    if (status !== undefined) {
      query = query.where('status', '=', status);
    }
    const rows = await query
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .execute<ItTicketRecord>();
    return this.withNames(rows);
  }

  async get(
    userId: string,
    role: ItTicketRole,
    id: number,
  ): Promise<ItTicketView> {
    const row = await this.findById(id);
    if (!row) {
      throw new ItTicketNotFoundError();
    }
    if (role === 'employee' && row.submitterId !== userId) {
      // An employee must not learn whether somebody else's ticket exists.
      throw new ItTicketForbiddenError();
    }
    const [view] = await this.withNames([row]);
    return view;
  }

  async create(
    userId: string,
    input: CreateItTicketInput,
  ): Promise<ItTicketView> {
    const title = normalizeText(input.title);
    if (title.length === 0) {
      throw new ItTicketValidationError(
        'IT_TICKET_TITLE_REQUIRED',
        'A title is required.',
      );
    }
    if (title.length > 255) {
      throw new ItTicketValidationError(
        'IT_TICKET_TITLE_TOO_LONG',
        'The title is too long.',
      );
    }
    const category = input.category;
    if (!isCategory(category)) {
      throw new ItTicketValidationError(
        'IT_TICKET_INVALID_CATEGORY',
        'The category is not recognized.',
      );
    }
    const description = normalizeOptionalText(input.description);
    const now = new Date();
    const inserted = await this.database
      .query()
      .insertInto('itTickets')
      .values({
        title,
        category,
        description,
        submitterId: userId,
        handlerId: null,
        status: 'pending',
        resolutionNote: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const id = toNumber(inserted.insertId);
    if (id === undefined) {
      throw new ItTicketStateError();
    }
    return this.get(userId, 'employee', id);
  }

  /** A handler takes ownership of a pending ticket. */
  async start(
    userId: string,
    role: ItTicketRole,
    id: number,
  ): Promise<ItTicketView> {
    const row = await this.requireHandlerTicket(role, id);
    if (row.status !== 'pending') {
      throw new ItTicketStateError();
    }
    await this.database
      .query()
      .updateTable('itTickets')
      .set({ status: 'in-progress', handlerId: userId, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
    return this.get(userId, role, id);
  }

  /** A handler completes a ticket and records the resolution. */
  async complete(
    userId: string,
    role: ItTicketRole,
    id: number,
    resolutionNote?: unknown,
  ): Promise<ItTicketView> {
    const row = await this.requireHandlerTicket(role, id);
    if (row.status === 'completed') {
      throw new ItTicketStateError();
    }
    const note = normalizeOptionalText(resolutionNote);
    await this.database
      .query()
      .updateTable('itTickets')
      .set({
        status: 'completed',
        handlerId: row.handlerId ?? userId,
        resolutionNote: note,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return this.get(userId, role, id);
  }

  private async requireHandlerTicket(
    role: ItTicketRole,
    id: number,
  ): Promise<ItTicketRecord> {
    if (role !== 'handler') {
      throw new ItTicketForbiddenError();
    }
    const row = await this.findById(id);
    if (!row) {
      throw new ItTicketNotFoundError();
    }
    return row;
  }

  private async findById(id: number): Promise<ItTicketRecord | undefined> {
    return this.database
      .query()
      .selectFrom('itTickets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<ItTicketRecord>();
  }

  private async withNames(
    rows: readonly ItTicketRecord[],
  ): Promise<ItTicketView[]> {
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.submitterId);
      if (row.handlerId) {
        ids.add(row.handlerId);
      }
    }
    const names = await this.resolveNames([...ids]);
    return rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      category: isCategory(row.category) ? row.category : 'other',
      description: row.description,
      submitterId: row.submitterId,
      submitterName: names.get(row.submitterId) ?? null,
      handlerId: row.handlerId,
      handlerName: row.handlerId ? (names.get(row.handlerId) ?? null) : null,
      status: isStatus(row.status) ? row.status : 'pending',
      resolutionNote: row.resolutionNote,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }));
  }

  private async resolveNames(
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const users = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', userIds)
      .execute<{ id: string; name: string | null; username: string | null }>();
    return new Map(
      users.map((user) => [
        String(user.id),
        user.name?.trim() || user.username?.trim() || String(user.id),
      ]),
    );
  }
}

export const itTicketServiceToken = createServiceToken<ItTicketService>(
  'nb3-factory/it-ticket-service',
);

/** Binds the ticket service to the database and the authorization API. */
export class ItTicketServiceProvider extends ServiceProvider<Application> {
  readonly name = 'nb3-factory/it-tickets';

  register(): void {
    const database = this.app.container.resolve(databaseManagerToken);
    // The authorization service belongs to a plugin, so it is not guaranteed to
    // be registered yet when application providers register (an app started
    // without that plugin has no such token). Resolve it on first use instead
    // of pinning the provider to a plugin's registration order.
    const permissionSets: ItTicketRoleReader = {
      unrestricted: (identity) =>
        this.app.container
          .resolve(authorizationToken)
          .permissionSets.unrestricted(identity),
      getEffective: (input) =>
        this.app.container
          .resolve(authorizationToken)
          .permissionSets.getEffective(input),
    };
    this.app.container.instance(
      itTicketServiceToken,
      new ItTicketService(database, permissionSets),
    );
  }
}

function isCategory(value: unknown): value is ItTicketCategory {
  return (
    typeof value === 'string' &&
    (IT_TICKET_CATEGORIES as readonly string[]).includes(value)
  );
}

function isStatus(value: unknown): value is ItTicketStatus {
  return (
    value === 'pending' || value === 'in-progress' || value === 'completed'
  );
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalText(value: unknown): string | null {
  const text = normalizeText(value);
  return text.length === 0 ? null : text;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    return Number(value);
  }
  return undefined;
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}
