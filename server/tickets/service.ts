import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type {
  DatabaseConnection,
  DatabaseManager,
  RepositoryPolicy,
} from '@nocobase/db';
import { ApiError } from '@nocobase/app-server/router';

import type {
  TicketCommentRow,
  TicketRow,
  TicketScreenshotRow,
} from './resources.js';
import { noopTicketNotifier, type TicketNotifier } from './notifier.js';

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TICKET_CATEGORIES = [
  'incident',
  'access',
  'hardware',
  'software',
  'other',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/** A ticket is overdue when it is still active 24 hours after it was opened. */
export const TICKET_OVERDUE_MS = 24 * 60 * 60 * 1000;

const isOverdue = (
  row: Pick<TicketRow, 'status' | 'createdAt'>,
  now = Date.now(),
): boolean => {
  if (row.status !== 'open' && row.status !== 'in_progress') return false;
  const createdAt = new Date(row.createdAt).getTime();
  return Number.isFinite(createdAt) && now - createdAt > TICKET_OVERDUE_MS;
};

export interface TicketListInput {
  readonly q?: string;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly category?: TicketCategory;
  readonly page: number;
  readonly pageSize: number;
}

export interface UserSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface AttachmentView {
  readonly id: string;
  readonly fileId: string;
  readonly commentId: string | null;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly contentUrl: string;
}

export interface CommentView {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly author: UserSummary | null;
  readonly body: string;
  readonly internal: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly AttachmentView[];
}

export interface TicketListItem {
  readonly id: string;
  readonly ticketNo: string;
  readonly title: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly category: TicketCategory;
  readonly requesterId: string;
  readonly requester: UserSummary | null;
  readonly assigneeId: string | null;
  readonly assignee: UserSummary | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly overdue: boolean;
  readonly slaDeadline: string;
}

export interface TicketDetail extends TicketListItem {
  readonly description: string;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly comments: readonly CommentView[];
  readonly attachments: readonly AttachmentView[];
  readonly viewer: {
    readonly canCommentInternal: boolean;
    readonly canAssign: boolean;
    readonly canResolve: boolean;
    readonly canClose: boolean;
    readonly canReopen: boolean;
  };
}

export interface TicketPage {
  readonly rows: readonly TicketListItem[];
  readonly total: number;
}

export interface TicketWorkload {
  readonly user: UserSummary;
  readonly active: number;
  readonly overdue: number;
}

export interface TicketDashboard {
  readonly viewer: { readonly serviceDesk: boolean };
  readonly counts: {
    readonly open: number;
    readonly inProgress: number;
    readonly resolved: number;
    readonly closed: number;
    readonly active: number;
    readonly unassigned: number;
    readonly overdue: number;
  };
  readonly unassigned: readonly TicketListItem[];
  readonly overdue: readonly TicketListItem[];
  readonly awaitingConfirmation: readonly TicketListItem[];
  readonly recent: readonly TicketListItem[];
  readonly workload: readonly TicketWorkload[];
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly priority: TicketPriority;
  readonly category: TicketCategory;
}

export interface TicketFileDownload {
  readonly filename: string;
  readonly mimeType: string;
  readonly stream: ReadableStream;
}

export interface TicketService {
  list(
    authz: AuthorizationContext,
    input: TicketListInput,
  ): Promise<TicketPage>;
  get(authz: AuthorizationContext, ticketId: string): Promise<TicketDetail>;
  create(
    authz: AuthorizationContext,
    input: CreateTicketInput,
  ): Promise<TicketDetail>;
  addComment(
    authz: AuthorizationContext,
    ticketId: string,
    body: string,
    internal: boolean,
  ): Promise<CommentView>;
  assign(
    authz: AuthorizationContext,
    ticketId: string,
    assigneeId: string,
  ): Promise<TicketDetail>;
  accept(
    authz: AuthorizationContext,
    ticketId: string,
    assigneeId?: string,
  ): Promise<TicketDetail>;
  resolve(authz: AuthorizationContext, ticketId: string): Promise<TicketDetail>;
  close(authz: AuthorizationContext, ticketId: string): Promise<TicketDetail>;
  reopen(authz: AuthorizationContext, ticketId: string): Promise<TicketDetail>;
  engineers(authz: AuthorizationContext): Promise<readonly UserSummary[]>;
  dashboard(authz: AuthorizationContext): Promise<TicketDashboard>;
  remindOverdue(): Promise<number>;
  uploadAttachment(
    authz: AuthorizationContext,
    ticketId: string,
    file: File,
    commentId?: string,
  ): Promise<AttachmentView>;
  downloadAttachment(
    authz: AuthorizationContext,
    ticketId: string,
    attachmentId: string,
  ): Promise<TicketFileDownload>;
}

type Policies = Record<string, RepositoryPolicy>;

const RESOURCE = { type: 'composite', id: 'support.tickets' } as const;
const POLICY_ALL: RepositoryPolicy = {
  read: true,
  create: false,
  update: false,
  delete: false,
};

const forbidden = (reason: string, message: string): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason,
    domain: 'tickets',
    message,
  });

const notFound = (): ApiError =>
  new ApiError({
    status: 'NOT_FOUND',
    reason: 'TICKET_NOT_FOUND',
    domain: 'tickets',
    message: 'The ticket was not found.',
  });

const invalid = (reason: string, message: string): ApiError =>
  new ApiError({
    status: 'FAILED_PRECONDITION',
    reason,
    domain: 'tickets',
    message,
  });

const iso = (value: string | Date | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
};

const statusOf = (value: string): TicketStatus =>
  TICKET_STATUSES.includes(value as TicketStatus)
    ? (value as TicketStatus)
    : 'open';
const priorityOf = (value: string): TicketPriority =>
  TICKET_PRIORITIES.includes(value as TicketPriority)
    ? (value as TicketPriority)
    : 'medium';
const categoryOf = (value: string): TicketCategory =>
  TICKET_CATEGORIES.includes(value as TicketCategory)
    ? (value as TicketCategory)
    : 'other';

const contentUrl = (ticketId: string, attachmentId: string): string =>
  `tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}/content`;

async function userIdsWithPermission(
  database: DatabaseManager,
  keys: readonly string[],
  connection: DatabaseConnection = database.connection(),
): Promise<string[]> {
  const rows = await connection.query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('subjectId')
    .where('subjectType', '=', 'user')
    .where('permissionSetKey', 'in', [...keys])
    .execute();
  return [...new Set(rows.map((row) => String(row.subjectId)))];
}

async function workloadFor(
  database: DatabaseManager,
  rows: readonly TicketRow[],
): Promise<TicketWorkload[]> {
  const ids = await userIdsWithPermission(database, [
    'tickets-maintainer',
    'tickets-admin',
  ]);
  if (ids.length === 0) return [];
  const users = await database
    .connection()
    .query.selectFrom('user')
    .select(['id', 'name', 'email'])
    .where('id', 'in', ids)
    .execute();
  const byId = new Map<
    string,
    { user: UserSummary; active: number; overdue: number }
  >();
  for (const row of users) {
    const id = String(row.id);
    byId.set(id, {
      user: {
        id,
        name: typeof row.name === 'string' ? row.name : '',
        email: typeof row.email === 'string' ? row.email : '',
      },
      active: 0,
      overdue: 0,
    });
  }
  for (const row of rows) {
    if (!row.assigneeId) continue;
    const entry = byId.get(row.assigneeId);
    if (!entry) continue;
    if (row.status === 'open' || row.status === 'in_progress') {
      entry.active += 1;
      if (isOverdue(row)) entry.overdue += 1;
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      b.active - a.active ||
      (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email),
  );
}

export function createTicketService(
  database: DatabaseManager,
  fileRepositories: ServerFileRepositoryManager,
  drive: NocoBaseDriveManager,
  notifier: TicketNotifier = noopTicketNotifier,
): TicketService {
  async function policies(
    authz: AuthorizationContext,
    action: string,
    required: readonly string[],
  ): Promise<Policies> {
    const decision = await authz.authorize({ resource: RESOURCE, action });
    const available = (
      decision.conditions as { database?: Policies } | undefined
    )?.database;
    if (decision.effect === 'deny' || !available) {
      throw forbidden(
        'TICKET_ACTION_DENIED',
        `The action "${action}" is not allowed.`,
      );
    }
    const missing = required.filter((collection) => !available[collection]);
    if (missing.length > 0) {
      throw forbidden(
        'TICKET_ACTION_DENIED',
        `The action "${action}" is not allowed.`,
      );
    }
    return available;
  }

  async function actionAvailable(
    authz: AuthorizationContext,
    action: string,
  ): Promise<boolean> {
    const decision = await authz.authorize({ resource: RESOURCE, action });
    return decision.effect !== 'deny';
  }

  async function findTicket(
    _authz: AuthorizationContext,
    ticketId: string,
    policy: RepositoryPolicy,
  ): Promise<TicketRow | undefined> {
    const row = await database
      .repository('tickets')
      .withPolicy(policy)
      .findOne({ filter: { id: ticketId } });
    return row as unknown as TicketRow | undefined;
  }

  async function requireTicket(
    authz: AuthorizationContext,
    ticketId: string,
    policy: RepositoryPolicy,
  ): Promise<TicketRow> {
    const ticket = await findTicket(authz, ticketId, policy);
    if (!ticket) throw notFound();
    return ticket;
  }

  async function userMap(
    ids: readonly string[],
  ): Promise<Map<string, UserSummary>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const rows = await database
      .connection()
      .query.selectFrom('user')
      .select(['id', 'name', 'email'])
      .where('id', 'in', unique)
      .execute();
    return new Map(
      rows.map((row) => [
        String(row.id),
        {
          id: String(row.id),
          name: typeof row.name === 'string' ? row.name : '',
          email: typeof row.email === 'string' ? row.email : '',
        },
      ]),
    );
  }

  function listItem(
    row: TicketRow,
    users: Map<string, UserSummary>,
  ): TicketListItem {
    return {
      id: row.id,
      ticketNo: row.ticketNo,
      title: row.title,
      status: statusOf(row.status),
      priority: priorityOf(row.priority),
      category: categoryOf(row.category),
      requesterId: row.requesterId,
      requester: users.get(row.requesterId) ?? null,
      assigneeId: row.assigneeId ?? null,
      assignee: row.assigneeId ? (users.get(row.assigneeId) ?? null) : null,
      createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
      updatedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
      overdue: isOverdue(row),
      slaDeadline: new Date(
        new Date(row.createdAt).getTime() + TICKET_OVERDUE_MS,
      ).toISOString(),
    };
  }

  function attachmentView(
    ticketId: string,
    row: TicketScreenshotRow,
    file: {
      id: string;
      filename: string;
      mimeType: string;
      size: string | number;
      createdAt: string | Date;
    },
  ): AttachmentView {
    return {
      id: row.id,
      fileId: file.id,
      commentId: row.commentId ?? null,
      filename: file.filename,
      mimeType: file.mimeType,
      size: Number(file.size),
      createdAt: iso(file.createdAt) ?? new Date(0).toISOString(),
      contentUrl: contentUrl(ticketId, row.id),
    };
  }

  async function commentsFor(
    ticketId: string,
    policy: RepositoryPolicy,
  ): Promise<{ rows: TicketCommentRow[]; users: Map<string, UserSummary> }> {
    const rows = (await database
      .repository('ticketComments')
      .withPolicy(policy)
      .findMany({
        filter: (filter) => filter.string('ticketId').eq(ticketId),
        sort: (sort) => sort.field('createdAt').asc(),
      })) as unknown as TicketCommentRow[];
    const users = await userMap(rows.map((row) => row.authorId));
    return { rows, users };
  }

  async function attachmentsFor(
    ticketId: string,
    policy: RepositoryPolicy,
  ): Promise<Map<string, AttachmentView[]>> {
    const rows = (await database
      .repository('ticketScreenshots')
      .withPolicy(policy)
      .findMany({
        filter: (filter) => filter.string('ticketId').eq(ticketId),
        sort: (sort) => sort.field('createdAt').asc(),
      })) as unknown as TicketScreenshotRow[];
    if (rows.length === 0) return new Map();
    const fileRows = await database
      .connection()
      .query.selectFrom('ticketFiles')
      .select(['id', 'filename', 'mimeType', 'size', 'createdAt'])
      .where(
        'id',
        'in',
        rows.map((row) => row.fileId),
      )
      .execute();
    const files = new Map(fileRows.map((row) => [String(row.id), row]));
    const grouped = new Map<string, AttachmentView[]>();
    for (const row of rows) {
      const file = files.get(row.fileId);
      if (!file) continue;
      const key = row.commentId ?? '';
      const item = attachmentView(ticketId, row, {
        id: String(file.id),
        filename: String(file.filename),
        mimeType: String(file.mimeType),
        size: file.size as string | number,
        createdAt: file.createdAt as string | Date,
      });
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return grouped;
  }

  async function detail(
    authz: AuthorizationContext,
    ticket: TicketRow,
    available: Policies,
  ): Promise<TicketDetail> {
    const commentsPromise = commentsFor(ticket.id, available.ticketComments);
    const attachmentsPromise = attachmentsFor(
      ticket.id,
      available.ticketScreenshots,
    );
    const usersPromise = userMap([ticket.requesterId, ticket.assigneeId ?? '']);
    const [
      comments,
      attachments,
      users,
      canCommentInternal,
      canAssign,
      canResolve,
      canClose,
      canReopen,
    ] = await Promise.all([
      commentsPromise,
      attachmentsPromise,
      usersPromise,
      actionAvailable(authz, 'commentInternal'),
      actionAvailable(authz, 'assign'),
      actionAvailable(authz, 'resolve'),
      actionAvailable(authz, 'close'),
      actionAvailable(authz, 'reopen'),
    ]);
    const commentViews = comments.rows.map((comment) => ({
      id: comment.id,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      author: comments.users.get(comment.authorId) ?? null,
      body: comment.body,
      internal: Boolean(comment.internal),
      createdAt: iso(comment.createdAt) ?? new Date(0).toISOString(),
      updatedAt: iso(comment.updatedAt) ?? new Date(0).toISOString(),
      attachments: attachments.get(comment.id) ?? [],
    }));
    return {
      ...listItem(ticket, users),
      description: ticket.description,
      resolvedAt: iso(ticket.resolvedAt),
      closedAt: iso(ticket.closedAt),
      comments: commentViews,
      attachments: attachments.get('') ?? [],
      viewer: {
        canCommentInternal,
        canAssign,
        canResolve,
        canClose,
        canReopen,
      },
    };
  }

  async function transition(
    authz: AuthorizationContext,
    ticketId: string,
    action: 'assign' | 'resolve' | 'close' | 'reopen',
    values: Partial<TicketRow>,
    expected: readonly TicketStatus[],
    reason: string,
  ): Promise<TicketDetail> {
    const available = await policies(authz, action, ['tickets']);
    const readable = await policies(authz, 'view', [
      'tickets',
      'ticketComments',
      'ticketScreenshots',
    ]);
    const updated = await database.transaction(async (connection) => {
      const repository = connection
        .repository('tickets')
        .withPolicy(available.tickets);
      const ticket = (await repository.findOne({
        filter: { id: ticketId },
      })) as unknown as TicketRow | undefined;
      if (!ticket) throw notFound();
      const status = statusOf(ticket.status);
      if (!expected.includes(status)) {
        throw invalid(
          reason,
          `The ticket is ${status}, so this transition is not available.`,
        );
      }
      if (action === 'assign' && values.assigneeId) {
        const user = await connection.query
          .selectFrom('user')
          .select('id')
          .where('id', '=', values.assigneeId)
          .executeTakeFirst();
        if (!user) {
          throw invalid(
            'TICKET_ASSIGNEE_NOT_FOUND',
            'The chosen assignee does not exist.',
          );
        }
        const engineerIds = await userIdsWithPermission(
          database,
          ['tickets-maintainer', 'tickets-admin'],
          connection,
        );
        if (!engineerIds.includes(String(values.assigneeId))) {
          throw invalid(
            'TICKET_ASSIGNEE_NOT_ENGINEER',
            'The chosen assignee does not handle service tickets.',
          );
        }
      }
      const updated = (await repository.updateOne({
        filter: { id: ticketId },
        values: { ...values, updatedAt: new Date().toISOString() },
      })) as unknown as { record: TicketRow } | TicketRow;
      const row = 'record' in updated ? updated.record : updated;
      return { ...ticket, ...row };
    });
    return detail(authz, updated, readable);
  }

  return {
    async list(authz, input) {
      const available = await policies(authz, 'view', ['tickets']);
      const repository = database
        .repository('tickets')
        .withPolicy(available.tickets);
      const filter = (
        builder: import('@nocobase/repository-input').FilterBuilder,
      ) => {
        const parts: import('@nocobase/repository-input').FilterNode[] = [];
        if (input.q) {
          const needle = input.q.trim();
          if (needle) {
            parts.push(
              builder.or([
                builder
                  .string('title')
                  .includes(needle, { mode: 'insensitive' }),
                builder
                  .text('description')
                  .includes(needle, { mode: 'insensitive' }),
                builder
                  .string('ticketNo')
                  .includes(needle, { mode: 'insensitive' }),
              ]),
            );
          }
        }
        if (input.status) {
          parts.push(builder.string('status').eq(input.status));
        }
        if (input.priority) {
          parts.push(builder.string('priority').eq(input.priority));
        }
        if (input.category) {
          parts.push(builder.string('category').eq(input.category));
        }
        return builder.and(parts);
      };
      const [rows, total] = await Promise.all([
        repository.findMany({
          filter,
          sort: (sort) => sort.field('createdAt').desc(),
          limit: input.pageSize,
          offset: (input.page - 1) * input.pageSize,
        }) as unknown as Promise<TicketRow[]>,
        repository.count({ filter }),
      ]);
      const users = await userMap(
        rows.flatMap((row) => [row.requesterId, row.assigneeId ?? '']),
      );
      return { rows: rows.map((row) => listItem(row, users)), total };
    },

    async get(authz, ticketId) {
      const available = await policies(authz, 'view', [
        'tickets',
        'ticketComments',
        'ticketScreenshots',
      ]);
      const ticket = await requireTicket(authz, ticketId, available.tickets);
      return detail(authz, ticket, available);
    },

    async create(authz, input) {
      const available = await policies(authz, 'create', ['tickets']);
      const principal = authz.identity.principal;
      if (principal.type !== 'user') {
        throw forbidden(
          'TICKET_ACTOR_NOT_USER',
          'Only a signed-in user may create a ticket.',
        );
      }
      const now = new Date().toISOString();
      const row = (await database
        .repository('tickets')
        .withPolicy(available.tickets)
        .createOne({
          values: {
            id: randomUUID(),
            ticketNo: `TKT-${Date.now().toString(36).toUpperCase()}-${randomUUID()
              .slice(0, 6)
              .toUpperCase()}`,
            title: input.title,
            description: input.description,
            status: 'open',
            priority: input.priority,
            category: input.category,
            requesterId: principal.id,
            assigneeId: null,
            resolvedAt: null,
            closedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        })) as unknown as { record: TicketRow } | TicketRow;
      const created = 'record' in row ? row.record : row;
      const readable = await policies(authz, 'view', [
        'tickets',
        'ticketComments',
        'ticketScreenshots',
      ]);
      const ticket = await detail(authz, created, readable);
      await notifier.created(ticket, principal.id);
      return ticket;
    },

    async addComment(authz, ticketId, body, internal) {
      const wantsInternal = internal;
      if (wantsInternal && !(await actionAvailable(authz, 'commentInternal'))) {
        throw forbidden(
          'TICKET_INTERNAL_COMMENT_DENIED',
          'Internal notes are limited to service staff.',
        );
      }
      const action = wantsInternal ? 'commentInternal' : 'comment';
      const available = await policies(authz, action, [
        'tickets',
        'ticketComments',
      ]);
      await requireTicket(authz, ticketId, available.tickets);
      const principal = authz.identity.principal;
      if (principal.type !== 'user') {
        throw forbidden(
          'TICKET_ACTOR_NOT_USER',
          'Only a signed-in user may comment.',
        );
      }
      const now = new Date().toISOString();
      const created = (await database
        .repository('ticketComments')
        .withPolicy(available.ticketComments)
        .createOne({
          values: {
            id: randomUUID(),
            ticketId,
            authorId: principal.id,
            body,
            internal: wantsInternal,
            createdAt: now,
            updatedAt: now,
          },
        })) as unknown as { record: TicketCommentRow } | TicketCommentRow;
      const comment = 'record' in created ? created.record : created;
      const users = await userMap([comment.authorId]);
      const view = {
        id: comment.id,
        ticketId: comment.ticketId,
        authorId: comment.authorId,
        author: users.get(comment.authorId) ?? null,
        body: comment.body,
        internal: Boolean(comment.internal),
        createdAt: iso(comment.createdAt) ?? now,
        updatedAt: iso(comment.updatedAt) ?? now,
        attachments: [],
      };
      const readable = await policies(authz, 'view', [
        'tickets',
        'ticketComments',
        'ticketScreenshots',
      ]);
      const ticket = await requireTicket(authz, ticketId, readable.tickets);
      await notifier.commented(
        await detail(authz, ticket, readable),
        view,
        principal.id,
      );
      return view;
    },

    async assign(authz, ticketId, assigneeId) {
      const principal = authz.identity.principal;
      if (principal.type !== 'user') {
        throw forbidden(
          'TICKET_ACTOR_NOT_USER',
          'Only a signed-in user may assign a ticket.',
        );
      }
      const updated = await transition(
        authz,
        ticketId,
        'assign',
        {
          status: 'in_progress',
          assigneeId,
          resolvedAt: null,
          closedAt: null,
        },
        ['open', 'in_progress'],
        'TICKET_CANNOT_ASSIGN',
      );
      await notifier.assigned(updated, principal.id);
      return updated;
    },

    /** Kept for clients that assign a ticket to themselves; the picker uses `assign`. */
    async accept(authz, ticketId, assigneeId) {
      const principal = authz.identity.principal;
      if (principal.type !== 'user') {
        throw forbidden(
          'TICKET_ACTOR_NOT_USER',
          'Only a signed-in user may accept a ticket.',
        );
      }
      const updated = await transition(
        authz,
        ticketId,
        'assign',
        {
          status: 'in_progress',
          assigneeId: assigneeId ?? principal.id,
          resolvedAt: null,
          closedAt: null,
        },
        ['open', 'in_progress'],
        'TICKET_CANNOT_ACCEPT',
      );
      await notifier.assigned(updated, principal.id);
      return updated;
    },

    async resolve(authz, ticketId) {
      const principal = authz.identity.principal;
      const updated = await transition(
        authz,
        ticketId,
        'resolve',
        {
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
          closedAt: null,
        },
        ['in_progress'],
        'TICKET_CANNOT_RESOLVE',
      );
      if (principal.type === 'user') {
        await notifier.resolved(updated, principal.id);
      }
      return updated;
    },

    async close(authz, ticketId) {
      const principal = authz.identity.principal;
      const updated = await transition(
        authz,
        ticketId,
        'close',
        { status: 'closed', closedAt: new Date().toISOString() },
        ['resolved'],
        'TICKET_CANNOT_CLOSE',
      );
      if (principal.type === 'user') {
        await notifier.closed(updated, principal.id);
      }
      return updated;
    },

    async reopen(authz, ticketId) {
      const principal = authz.identity.principal;
      const updated = await transition(
        authz,
        ticketId,
        'reopen',
        {
          status: 'in_progress',
          resolvedAt: null,
          closedAt: null,
        },
        ['resolved', 'closed'],
        'TICKET_CANNOT_REOPEN',
      );
      if (principal.type === 'user') {
        await notifier.reopened(updated, principal.id);
      }
      return updated;
    },

    async engineers(authz) {
      await policies(authz, 'assign', ['tickets']);
      const ids = await userIdsWithPermission(database, [
        'tickets-maintainer',
        'tickets-admin',
      ]);
      if (ids.length === 0) return [];
      const users = await userMap(ids);
      return [...users.values()].sort((a, b) =>
        (a.name || a.email).localeCompare(b.name || b.email),
      );
    },

    async dashboard(authz) {
      const available = await policies(authz, 'view', ['tickets']);
      const serviceDesk = await actionAvailable(authz, 'assign');
      const repository = database
        .repository('tickets')
        .withPolicy(available.tickets);
      const rows = (await repository.findMany({
        sort: (sort) => sort.field('createdAt').desc(),
        limit: 1000,
      })) as unknown as TicketRow[];
      const users = await userMap(
        rows.flatMap((row) => [row.requesterId, row.assigneeId ?? '']),
      );
      const items = rows.map((row) => listItem(row, users));
      const unassigned = items.filter(
        (item) =>
          !item.assigneeId &&
          (item.status === 'open' || item.status === 'in_progress'),
      );
      const overdue = items.filter((item) => item.overdue);
      const awaitingConfirmation = items.filter(
        (item) => item.status === 'resolved',
      );
      const workload = serviceDesk ? await workloadFor(database, rows) : [];
      // Seeing the service-desk dashboard is a natural moment to check the SLA. The notifier is idempotent per
      // ticket and day, so repeated dashboard loads do not create repeated reminders.
      if (serviceDesk) await this.remindOverdue();
      return {
        viewer: { serviceDesk },
        counts: {
          open: items.filter((item) => item.status === 'open').length,
          inProgress: items.filter((item) => item.status === 'in_progress')
            .length,
          resolved: awaitingConfirmation.length,
          closed: items.filter((item) => item.status === 'closed').length,
          active: items.filter(
            (item) => item.status === 'open' || item.status === 'in_progress',
          ).length,
          unassigned: unassigned.length,
          overdue: overdue.length,
        },
        unassigned: unassigned.slice(0, 8),
        overdue: overdue.slice(0, 8),
        awaitingConfirmation: awaitingConfirmation.slice(0, 8),
        recent: items.slice(0, 8),
        workload,
      };
    },

    async remindOverdue() {
      const threshold = new Date(Date.now() - TICKET_OVERDUE_MS).toISOString();
      const rows = (await database
        .repository('tickets')
        .withPolicy(POLICY_ALL)
        .findMany({
          filter: (filter) =>
            filter.and([
              filter.or([
                filter.string('status').eq('open'),
                filter.string('status').eq('in_progress'),
              ]),
              filter.date('createdAt').before(threshold),
            ]),
          sort: (sort) => sort.field('createdAt').asc(),
          limit: 200,
        })) as unknown as TicketRow[];
      if (rows.length === 0) return 0;
      const users = await userMap(
        rows.flatMap((row) => [row.requesterId, row.assigneeId ?? '']),
      );
      for (const row of rows) {
        await notifier.remindOverdue(listItem(row, users));
      }
      return rows.length;
    },

    async uploadAttachment(authz, ticketId, file, commentId) {
      const available = await policies(authz, 'attach', [
        'tickets',
        'ticketComments',
        'ticketScreenshots',
      ]);
      await requireTicket(authz, ticketId, available.tickets);
      if (commentId) {
        const comment = (await database
          .repository('ticketComments')
          .withPolicy(available.ticketComments)
          .findOne({ filter: { id: commentId, ticketId } })) as unknown as
          TicketCommentRow | undefined;
        if (!comment) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'TICKET_COMMENT_NOT_FOUND',
            domain: 'tickets',
            message: 'The comment was not found.',
          });
        }
      }
      const now = new Date().toISOString();
      return database.transaction(async (connection) => {
        const repository = fileRepositories.repository('ticketFiles', {
          transaction: connection,
          disk: 'local',
          accessPath: '/tickets/attachments',
          // The ticket and screenshot policies are checked above and below;
          // this policy only licenses the plugin's own fixed file columns.
          policy: {
            create: true,
            read: true,
            update: false,
            delete: false,
          },
        });
        const uploaded = await repository.uploadOne({ file });
        const linked = (await connection
          .repository('ticketScreenshots')
          .withPolicy(available.ticketScreenshots)
          .createOne({
            values: {
              id: randomUUID(),
              ticketId,
              fileId: uploaded.record.id,
              commentId: commentId ?? null,
              createdAt: now,
              updatedAt: now,
            },
          })) as unknown as
          { record: TicketScreenshotRow } | TicketScreenshotRow;
        const screenshot = 'record' in linked ? linked.record : linked;
        return attachmentView(ticketId, screenshot, uploaded.record);
      });
    },

    async downloadAttachment(authz, ticketId, attachmentId) {
      const available = await policies(authz, 'download', [
        'tickets',
        'ticketScreenshots',
      ]);
      await requireTicket(authz, ticketId, available.tickets);
      const screenshot = (await database
        .repository('ticketScreenshots')
        .withPolicy(available.ticketScreenshots)
        .findOne({ filter: { id: attachmentId, ticketId } })) as unknown as
        TicketScreenshotRow | undefined;
      if (!screenshot) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'TICKET_ATTACHMENT_NOT_FOUND',
          domain: 'tickets',
          message: 'The attachment was not found.',
        });
      }
      const file = await database
        .connection()
        .query.selectFrom('ticketFiles')
        .select(['disk', 'key', 'filename', 'mimeType'])
        .where('id', '=', screenshot.fileId)
        .executeTakeFirst();
      if (!file) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'TICKET_ATTACHMENT_NOT_FOUND',
          domain: 'tickets',
          message: 'The attachment file was not found.',
        });
      }
      const disk = drive.use(String(file.disk));
      if (!(await disk.exists(String(file.key)))) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'TICKET_ATTACHMENT_NOT_FOUND',
          domain: 'tickets',
          message: 'The attachment file is missing from storage.',
        });
      }
      const stream = await disk.getStream(String(file.key));
      return {
        filename: String(file.filename),
        mimeType: String(file.mimeType),
        stream: Readable.toWeb(stream) as unknown as ReadableStream,
      };
    },
  };
}
