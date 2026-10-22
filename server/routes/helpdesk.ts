import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import {
  FILE_COLUMNS,
  serverFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { AuthorizationContext } from '@nocobase/authorization';
import {
  buildRepositoryPolicy,
  databaseManagerToken,
  type DatabaseManager,
  type FilterBuilder,
  type Repository,
  type RepositoryFilter,
  type RepositoryOperations,
  type RepositoryPolicy,
} from '@nocobase/db';
import {
  LifecycleError,
  SYSTEM_ACTOR,
  lifecycleDescriptionView,
  lifecycleErrorFields,
  type LifecycleActor,
  type LifecycleRuntime,
  type RecordView,
} from '@nocobase/lifecycle';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { Hono } from 'hono';

import { helpdeskLifecycleRuntimeToken } from '../helpdesk/lifecycle-provider.js';
import {
  readHelpdeskSettings,
  writeHelpdeskSettings,
} from '../helpdesk/settings.js';
import {
  AssigneeSchema,
  AttachmentParams,
  AttachmentSchema,
  CommentInput,
  CommentSchema,
  CreateTicketInput,
  DashboardSchema,
  FireTicketInput,
  HelpdeskSettingsSchema,
  ListTicketsQuery,
  TicketDetailSchema,
  TicketParams,
  TicketSchema,
  TicketViewSchema,
  UpdateSettingsInput,
  WorkflowDefinitionSchema,
  WorkflowExecutionParams,
  WorkflowExecutionSchema,
  WorkflowExecutionsQuery,
} from './schemas/helpdesk.js';

const DOMAIN = 'helpdesk';
const LIFECYCLE = 'helpdeskTicket';
const TICKET_COLLECTION = 'helpdeskTickets';

const ACTION_BY_TRANSITION: Readonly<Record<string, string>> = {
  assign: 'assign',
  reassign: 'assign',
  progress: 'progress',
  resolve: 'resolve',
  confirm: 'confirm',
  return: 'return',
};

const TRANSITION_BY_ACTION: Readonly<Record<string, string>> = {
  assign: 'assign',
  progress: 'progress',
  resolve: 'resolve',
  confirm: 'confirm',
  return: 'return',
};

interface TicketRow extends Record<string, unknown> {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  statusChangedAt: string;
  lifecycleVersion: number;
  reporterId: string;
  assigneeId?: string | null;
  resolution?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  lastReminderAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

type TicketRepository = RepositoryOperations<
  Partial<TicketRow>,
  Partial<TicketRow>,
  Partial<TicketRow>
>;
type PolicyBinding = RepositoryPolicy | true;
type HelpdeskEnv = AuthEnv & AuthorizationEnv;

interface TicketActor {
  readonly id: string;
  readonly actor: LifecycleActor;
}

function denied(message: string): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'HELPDESK_PERMISSION_DENIED',
    domain: DOMAIN,
    message,
  });
}

function notFound(message: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'HELPDESK_RECORD_NOT_FOUND',
    domain: DOMAIN,
    message,
  });
}

function lifecycleFailure(error: unknown): never {
  if (error instanceof LifecycleError) {
    const fields = lifecycleErrorFields(error, { inputField: 'input' });
    if (fields) throw new ApiError({ ...fields, domain: DOMAIN });
  }
  throw error;
}

function actorOf(context: {
  get(key: 'auth'): { user: { id: string } } | null;
}): TicketActor {
  const auth = context.get('auth');
  if (!auth?.user?.id) {
    throw denied('You must be signed in to use the helpdesk.');
  }
  return { id: String(auth.user.id), actor: { id: String(auth.user.id) } };
}

function permits(
  decision: Awaited<ReturnType<AuthorizationContext['authorize']>>,
): boolean {
  return decision.effect !== 'deny';
}

async function decide(
  authz: AuthorizationContext,
  resource: { type: 'composite' | 'settings'; id: string },
  action: string,
) {
  return authz.authorize({
    resource: resource as { type: 'composite'; id: string },
    action,
  });
}

async function dashboardPolicy(
  authz: AuthorizationContext,
): Promise<PolicyBinding> {
  const decision = await decide(
    authz,
    { type: 'composite', id: 'helpdesk.dashboard' },
    'view',
  );
  if (!permits(decision)) {
    throw denied('The helpdesk dashboard is not available to you.');
  }
  if (decision.effect === 'permit') return true;
  const policy = decision.conditions?.database?.[TICKET_COLLECTION];
  if (!policy) {
    throw denied('The helpdesk dashboard has no record access.');
  }
  return policy;
}

async function ticketPolicy(
  authz: AuthorizationContext,
  action: string,
): Promise<PolicyBinding> {
  const decision = await decide(
    authz,
    { type: 'composite', id: 'helpdesk.tickets' },
    action,
  );
  if (!permits(decision)) {
    throw denied(`The helpdesk action "${action}" is not allowed.`);
  }
  if (decision.effect === 'permit') return true;
  const policy = decision.conditions?.database?.[TICKET_COLLECTION];
  if (!policy) {
    throw denied(`The helpdesk action "${action}" has no record access.`);
  }
  return policy;
}

function bindPolicy(
  repository: Repository<TicketRow>,
  policy: PolicyBinding,
): TicketRepository {
  return policy === true ? repository : repository.withPolicy(policy);
}

async function requireSetting(
  authz: AuthorizationContext,
  id: 'helpdesk.workflow' | 'helpdesk.reminders',
  action: string,
): Promise<void> {
  const allowed = await authz.can({
    resource: { type: 'settings', id },
    action,
  });
  if (!allowed) {
    throw denied(`The setting "${id}" is not available.`);
  }
}

function ticketRepository(database: DatabaseManager): Repository<TicketRow> {
  return database.repository<TicketRow>(TICKET_COLLECTION);
}

async function readTicket(
  repository: TicketRepository,
  ticketId: string,
): Promise<Partial<TicketRow>> {
  const ticket = await repository.findOne({ filter: { id: ticketId } });
  if (!ticket) throw notFound(`Ticket ${ticketId} was not found.`);
  return ticket;
}

function recordId(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Resolves the names the pages show next to the ids stored on tickets and
 * comments. A person removed after writing a comment simply keeps the id
 * fallback the UI already knows how to render.
 */
async function personNames(
  app: Application,
  ids: Iterable<string | null | undefined>,
): Promise<ReadonlyMap<string, string>> {
  const unique = [
    ...new Set(
      [...ids].filter((id): id is string => Boolean(id) && id !== 'system'),
    ),
  ];
  if (unique.length === 0 || !app.container.has(userManagementServiceToken)) {
    return new Map();
  }
  const users = app.container.resolve(userManagementServiceToken);
  const resolved = await Promise.all(
    unique.map(async (id) => {
      try {
        const user = await users.get(id);
        return [id, user.name || user.email || id] as const;
      } catch {
        return [id, id] as const;
      }
    }),
  );
  return new Map(resolved);
}

function withPeople<T extends object>(
  ticket: T,
  names: ReadonlyMap<string, string>,
): T & { reporterName: string | null; assigneeName: string | null } {
  const row = ticket as { reporterId?: unknown; assigneeId?: unknown };
  const reporterId = recordId(row.reporterId);
  const assigneeId = recordId(row.assigneeId);
  return {
    ...ticket,
    reporterName: reporterId ? (names.get(reporterId) ?? null) : null,
    assigneeName: assigneeId ? (names.get(assigneeId) ?? null) : null,
  };
}

async function namedComments(
  app: Application,
  comments: readonly Readonly<Record<string, unknown>>[],
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const names = await personNames(
    app,
    comments.map((comment) => comment.authorId as string | null | undefined),
  );
  return comments.map((comment) => {
    const authorId = recordId(comment.authorId);
    return {
      ...comment,
      authorName: authorId ? (names.get(authorId) ?? null) : null,
    };
  });
}

async function readView(
  runtime: LifecycleRuntime,
  ticketId: string,
  actor: LifecycleActor,
): Promise<RecordView> {
  try {
    return await runtime.view(LIFECYCLE, ticketId, actor);
  } catch (error) {
    return lifecycleFailure(error);
  }
}

async function permissionsFor(
  authz: AuthorizationContext,
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    Object.entries(TRANSITION_BY_ACTION).map(async ([action]) => {
      const decision = await decide(
        authz,
        { type: 'composite', id: 'helpdesk.tickets' },
        action,
      );
      return [action, permits(decision)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function withHistoryPeople(
  app: Application,
  view: RecordView,
): Promise<RecordView> {
  const history = view.history;
  if (!history.transitions.length) return view;
  const names = await personNames(
    app,
    history.transitions.map((entry) => recordId(entry.actorId)),
  );
  return {
    ...view,
    history: {
      ...history,
      transitions: history.transitions.map((entry) => ({
        ...entry,
        actorName: names.get(entry.actorId) ?? null,
      })),
    },
  };
}

function visibleLifecycle(
  view: RecordView,
  permissions: Readonly<Record<string, boolean>>,
): RecordView {
  return {
    ...view,
    available: view.available.map((transition) => {
      const action = ACTION_BY_TRANSITION[transition.name];
      if (action && permissions[action] !== false) return transition;
      return {
        ...transition,
        allowed: false,
        blockers: [
          ...transition.blockers,
          {
            source: 'manual' as const,
            kind: 'permission' as const,
            code: 'HELPDESK_PERMISSION_DENIED',
            message: 'Your role cannot use this action.',
          },
        ],
      };
    }),
  };
}

async function attachmentsFor(
  database: DatabaseManager,
  ticketId: string,
): Promise<Readonly<Record<string, unknown>>[]> {
  const attachments = await database
    .repository<Record<string, unknown>>('helpdeskAttachments')
    .findMany({
      filter: { ticketId },
      sort: (sort) => sort.field('createdAt').asc(),
    });
  if (!attachments.length) return [];
  const fileIds = attachments.map((attachment) => String(attachment.fileId));
  const files = await database
    .repository<FileRecord>('helpdeskFiles')
    .findMany({
      filter: (filter) =>
        filter.or(fileIds.map((id) => filter.string('id').eq(id))),
    });
  const byId = new Map(files.map((file) => [String(file.id), file]));
  return attachments.map((attachment) => ({
    ...attachment,
    file: byId.get(String(attachment.fileId)),
  }));
}

async function commentsFor(
  database: DatabaseManager,
  ticketId: string,
): Promise<Readonly<Record<string, unknown>>[]> {
  return database
    .repository<Record<string, unknown>>('helpdeskComments')
    .findMany({
      filter: { ticketId },
      sort: (sort) => sort.field('createdAt').asc(),
    });
}

function attachmentPolicy(): RepositoryPolicy {
  return buildRepositoryPolicy((policy) =>
    policy
      .read((read) => read.scope(true).fields(...FILE_COLUMNS))
      .create((create) =>
        create
          .scope(true)
          .fields(...FILE_COLUMNS)
          .defaults({}),
      )
      .update(false)
      .delete(false),
  );
}

function newTicketNo(): string {
  const now = new Date();
  const date = [
    String(now.getUTCFullYear()).slice(2),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
  return `HD-${date}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function ticketFilter(
  query: ReturnType<typeof ListTicketsQuery.parse>,
  overdueBefore?: string,
): RepositoryFilter<TicketRow> {
  return (filter) => {
    const conditions = [
      ...(query.overdue
        ? [
            filter.string('status').eq('processing'),
            // A reminder moves `statusChangedAt` to the reminder time, so a
            // ticket that was already reminded stays overdue until it leaves
            // processing. Otherwise the dashboard would go back to zero the
            // moment the service desk was told about it.
            filter.or([
              filter
                .date('statusChangedAt')
                .before(overdueBefore ?? new Date().toISOString()),
              filter.date('lastReminderAt').notEmpty(),
            ]),
          ]
        : []),
      ...(query.status ? [filter.string('status').eq(query.status)] : []),
      ...(query.priority ? [filter.string('priority').eq(query.priority)] : []),
      ...(query.category ? [filter.string('category').eq(query.category)] : []),
      ...(query.search
        ? [
            filter.or([
              filter
                .string('ticketNo')
                .includes(query.search, { mode: 'insensitive' }),
              filter
                .string('title')
                .includes(query.search, { mode: 'insensitive' }),
              filter
                .text('description')
                .includes(query.search, { mode: 'insensitive' }),
            ]),
          ]
        : []),
    ];
    return filter.and(
      conditions.length ? conditions : [filter.string('id').notEmpty()],
    );
  };
}

export function createHelpdeskRoutes(app: Application): Hono {
  const router = new Hono<HelpdeskEnv>();
  const routes = new Hono<HelpdeskEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const database = app.container.resolve(databaseManagerToken);

  // This sub-router is mounted only at /helpdesk, so no middleware reaches a
  // route another contribution owns.

  routes.use('*', auth.required(), authorization.middleware());

  routes.get(
    '/tickets',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'List helpdesk tickets',
      operationId: 'listHelpdeskTickets',
      responses: {
        '200': listResponse(TicketSchema, undefined, 'A page of tickets.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', ListTicketsQuery),
    async (context) => {
      const query = context.req.valid('query');
      const policy = await ticketPolicy(context.get('authz'), 'view');
      const repository = bindPolicy(ticketRepository(database), policy);
      const settings = query.overdue
        ? await readHelpdeskSettings(database)
        : undefined;
      const overdueBefore = settings
        ? new Date(
            Date.now() - settings.reminderHours * 3_600_000,
          ).toISOString()
        : undefined;
      const filter = ticketFilter(query, overdueBefore);
      const [rows, total] = await Promise.all([
        repository.findMany({
          filter,
          sort: (sort) => sort.field('createdAt').desc(),
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        }),
        repository.count({ filter }),
      ]);
      const names = await personNames(
        app,
        rows.flatMap((ticket) => [ticket.reporterId, ticket.assigneeId]),
      );
      return context.json({
        data: rows.map((ticket) => withPeople(ticket, names)),
        meta: { page: query.page, pageSize: query.pageSize, total },
      });
    },
  );

  routes.post(
    '/tickets',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Open a helpdesk ticket',
      operationId: 'createHelpdeskTicket',
      responses: {
        '200': dataResponse(TicketDetailSchema, 'The created ticket.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', CreateTicketInput),
    async (context) => {
      const input = context.req.valid('json');
      const principal = actorOf(context);
      const policy = await ticketPolicy(context.get('authz'), 'create');
      void policy;
      const runtime = app.container.resolve(helpdeskLifecycleRuntimeToken);
      const now = new Date().toISOString();
      try {
        const result = await runtime.create(
          LIFECYCLE,
          {
            id: randomUUID(),
            ticketNo: newTicketNo(),
            title: input.title,
            description: input.description,
            category: input.category,
            priority: input.priority,
            reporterId: principal.id,
            assigneeId: null,
            resolution: null,
            resolvedAt: null,
            closedAt: null,
            lastReminderAt: null,
            createdAt: now,
            updatedAt: now,
          },
          { actor: principal.actor },
        );
        const ticketId = String(result.record.id);
        const view = await readView(runtime, ticketId, principal.actor);
        const permissions = await permissionsFor(context.get('authz'));
        const names = await personNames(app, [
          recordId(result.record.reporterId),
          recordId(result.record.assigneeId),
        ]);
        return context.json({
          data: {
            ticket: withPeople(result.record, names),
            lifecycle: visibleLifecycle(view, permissions),
            permissions,
            comments: await namedComments(
              app,
              await commentsFor(database, ticketId),
            ),
            attachments: await attachmentsFor(database, ticketId),
          },
        });
      } catch (error) {
        return lifecycleFailure(error);
      }
    },
  );

  routes.get(
    '/tickets/:ticketId',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Get a helpdesk ticket',
      operationId: 'getHelpdeskTicket',
      responses: {
        '200': dataResponse(TicketDetailSchema, 'The ticket and its history.'),
        ...apiErrorResponses,
        '404': apiErrorResponse(404),
      },
    }),
    apiValidator('param', TicketParams),
    async (context) => {
      const { ticketId } = context.req.valid('param');
      const principal = actorOf(context);
      const policy = await ticketPolicy(context.get('authz'), 'view');
      const ticket = await readTicket(
        bindPolicy(ticketRepository(database), policy),
        ticketId,
      );
      const runtime = app.container.resolve(helpdeskLifecycleRuntimeToken);
      const view = await readView(runtime, ticketId, principal.actor);
      const permissions = await permissionsFor(context.get('authz'));
      const names = await personNames(app, [
        recordId(ticket.reporterId),
        recordId(ticket.assigneeId),
      ]);
      return context.json({
        data: {
          ticket: withPeople(ticket, names),
          lifecycle: visibleLifecycle(
            await withHistoryPeople(app, view),
            permissions,
          ),
          permissions,
          comments: await namedComments(
            app,
            await commentsFor(database, ticketId),
          ),
          attachments: await attachmentsFor(database, ticketId),
        },
      });
    },
  );

  routes.post(
    '/tickets/:ticketId/fire',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Move a helpdesk ticket through its lifecycle',
      operationId: 'fireHelpdeskTicketTransition',
      description:
        'The transition must be allowed both by its lifecycle guard and by the caller’s business permission.',
      responses: {
        '200': dataResponse(
          TicketViewSchema,
          'The ticket after the transition.',
        ),
        ...apiErrorResponses,
        '400': apiErrorResponse(400, 'The transition was refused.'),
        '404': apiErrorResponse(404),
        '409': apiErrorResponse(409, 'The ticket changed since it was read.'),
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', FireTicketInput),
    async (context) => {
      const { ticketId } = context.req.valid('param');
      const input = context.req.valid('json');
      const principal = actorOf(context);
      const action = ACTION_BY_TRANSITION[input.transition];
      const policy = await ticketPolicy(context.get('authz'), action);
      await readTicket(
        bindPolicy(ticketRepository(database), policy),
        ticketId,
      );
      const runtime = app.container.resolve(helpdeskLifecycleRuntimeToken);
      try {
        await runtime.fire(LIFECYCLE, ticketId, input.transition, {
          manual: true,
          actor: principal.actor,
          input: (input.input ?? {}) as never,
          requestId: input.requestId,
          expect: { version: input.expectVersion ?? null },
        });
        const view = await readView(runtime, ticketId, principal.actor);
        const permissions = await permissionsFor(context.get('authz'));
        return context.json({
          data: visibleLifecycle(view, permissions),
        });
      } catch (error) {
        return lifecycleFailure(error);
      }
    },
  );

  routes.get(
    '/tickets/:ticketId/lifecycle',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Get a ticket lifecycle view',
      operationId: 'getHelpdeskTicketLifecycle',
      responses: {
        '200': dataResponse(TicketViewSchema, 'The lifecycle view.'),
        ...apiErrorResponses,
        '404': apiErrorResponse(404),
      },
    }),
    apiValidator('param', TicketParams),
    async (context) => {
      const { ticketId } = context.req.valid('param');
      const principal = actorOf(context);
      const policy = await ticketPolicy(context.get('authz'), 'view');
      await readTicket(
        bindPolicy(ticketRepository(database), policy),
        ticketId,
      );
      const view = await readView(
        app.container.resolve(helpdeskLifecycleRuntimeToken),
        ticketId,
        principal.actor,
      );
      const permissions = await permissionsFor(context.get('authz'));
      return context.json({
        data: visibleLifecycle(view, permissions),
      });
    },
  );

  routes.post(
    '/tickets/:ticketId/comments',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Add a comment to a helpdesk ticket',
      operationId: 'commentHelpdeskTicket',
      responses: {
        '200': dataResponse(CommentSchema, 'The new comment.'),
        ...apiErrorResponses,
        '404': apiErrorResponse(404),
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', CommentInput),
    async (context) => {
      const { ticketId } = context.req.valid('param');
      const { body } = context.req.valid('json');
      const principal = actorOf(context);
      const policy = await ticketPolicy(context.get('authz'), 'view');
      await readTicket(
        bindPolicy(ticketRepository(database), policy),
        ticketId,
      );
      const comment = {
        id: randomUUID(),
        ticketId,
        authorId: principal.id,
        kind: 'comment' as const,
        body,
        createdAt: new Date().toISOString(),
      };
      await database
        .repository('helpdeskComments')
        .createOne({ values: comment });
      const names = await personNames(app, [principal.id]);
      return context.json({
        data: {
          ...comment,
          authorName: names.get(principal.id) ?? null,
        },
      });
    },
  );

  routes.get(
    '/tickets/:ticketId/attachments',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'List a ticket’s attachments',
      operationId: 'listHelpdeskTicketAttachments',
      responses: {
        '200': listResponse(AttachmentSchema, undefined, 'The attachments.'),
        ...apiErrorResponses,
        '404': apiErrorResponse(404),
      },
    }),
    apiValidator('param', TicketParams),
    async (context) => {
      const { ticketId } = context.req.valid('param');
      const policy = await ticketPolicy(context.get('authz'), 'view');
      await readTicket(
        bindPolicy(ticketRepository(database), policy),
        ticketId,
      );
      const rows = await attachmentsFor(database, ticketId);
      return context.json({
        data: rows,
        meta: { page: 1, pageSize: rows.length, total: rows.length },
      });
    },
  );

  routes.post(
    '/tickets/:ticketId/attachments',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Attach a file to a helpdesk ticket',
      operationId: 'uploadHelpdeskTicketAttachment',
      description:
        'Send multipart/form-data with one part named "file". Uploaded bytes are stored privately and read back through the attachment content route.',
      responses: {
        '200': dataResponse(AttachmentSchema, 'The stored attachment.'),
        ...apiErrorResponses,
        '404': apiErrorResponse(404),
        '413': apiErrorResponse(413, 'The file exceeds 10 MiB.'),
        '415': apiErrorResponse(415, 'The file part is missing.'),
      },
    }),
    bodyLimit({
      maxSize: 10 * 1024 * 1024,
      onError: (context) =>
        apiErrorHandler(
          new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'HELPDESK_ATTACHMENT_TOO_LARGE',
            domain: DOMAIN,
            message: 'The attachment exceeds 10 MiB.',
            httpStatus: 413,
          }),
          context,
        ),
    }),
    apiValidator('param', TicketParams),
    async (context) => {
      const { ticketId } = context.req.valid('param');
      const principal = actorOf(context);
      const policy = await ticketPolicy(context.get('authz'), 'view');
      await readTicket(
        bindPolicy(ticketRepository(database), policy),
        ticketId,
      );

      let file: File | null = null;
      try {
        file = (await context.req.formData()).get('file') as File | null;
      } catch {
        file = null;
      }
      if (!(file instanceof File)) {
        throw new ApiError({
          status: 'INVALID_ARGUMENT',
          reason: 'HELPDESK_ATTACHMENT_MISSING',
          domain: DOMAIN,
          message: 'Send multipart/form-data with one part named "file".',
          httpStatus: 415,
        });
      }

      const files = app.container.resolve(serverFileRepositoryManagerToken);
      const stored = await database.transaction(async (connection) => {
        const repository = files.repository('helpdeskFiles', {
          disk: 'local',
          accessPath: '/helpdesk-attachments',
          policy: attachmentPolicy(),
          transaction: connection,
        });
        const uploaded = await repository.uploadOne({ file });
        const attachment = {
          id: randomUUID(),
          ticketId,
          fileId: uploaded.record.id,
          uploadedById: principal.id,
          createdAt: new Date().toISOString(),
        };
        await connection
          .repository('helpdeskAttachments')
          .createOne({ values: attachment });
        return { ...attachment, file: uploaded.record };
      });
      return context.json({ data: stored });
    },
  );

  routes.get(
    '/tickets/:ticketId/attachments/:attachmentId/content',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Download a ticket attachment',
      operationId: 'downloadHelpdeskTicketAttachment',
      description:
        'The caller must be able to view the ticket; the bytes are never served by a public URL.',
      responses: {
        '200': {
          description: 'The attachment bytes.',
          content: {
            'application/octet-stream': {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
        ...apiErrorResponses,
        '404': apiErrorResponse(404),
      },
    }),
    apiValidator('param', AttachmentParams),
    async (context) => {
      const { ticketId, attachmentId } = context.req.valid('param');
      const policy = await ticketPolicy(context.get('authz'), 'view');
      await readTicket(
        bindPolicy(ticketRepository(database), policy),
        ticketId,
      );
      const attachment = await database
        .repository<Record<string, unknown>>('helpdeskAttachments')
        .findOne({ filter: { id: attachmentId, ticketId } });
      if (!attachment) throw notFound('The attachment was not found.');
      const file = await database
        .repository<FileRecord>('helpdeskFiles')
        .findOne({ filter: { id: String(attachment.fileId) } });
      if (!file) throw notFound('The attachment file was not found.');

      const drive = app.container.resolve(driveManagerToken);
      const stream = await drive.use(file.disk).getStream(file.key);
      const encoded = encodeURIComponent(file.filename);
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: {
          'content-type': file.mimeType || 'application/octet-stream',
          'content-length': String(file.size),
          'content-disposition': `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
          'cache-control': 'private, no-store',
        },
      });
    },
  );

  routes.get(
    '/assignees',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'List people a ticket can be assigned to',
      operationId: 'listHelpdeskAssignees',
      description:
        'Returns enabled engineers. The caller must be allowed to assign tickets; this exposes only the fields an assignment picker needs.',
      responses: {
        '200': dataResponse(
          z.array(AssigneeSchema),
          'People who can receive a ticket.',
        ),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      await ticketPolicy(context.get('authz'), 'assign');
      const users = app.container.resolve(userManagementServiceToken);
      const page = await users.list({
        roleScope: 'app',
        role: 'helpdesk-engineer',
        pageSize: 200,
        status: 'enabled',
      });
      return context.json({
        data: page.items.map((user) => ({
          id: String(user.id),
          name: user.name ?? null,
          email: user.email ?? null,
        })),
      });
    },
  );

  routes.get(
    '/dashboard',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Get the helpdesk dashboard',
      operationId: 'getHelpdeskDashboard',
      responses: {
        '200': dataResponse(DashboardSchema, 'Ticket aggregates.'),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const policy = await dashboardPolicy(context.get('authz'));
      const tickets = bindPolicy(ticketRepository(database), policy);
      const settings = await readHelpdeskSettings(database);
      const cutoff = new Date(
        Date.now() - settings.reminderHours * 3_600_000,
      ).toISOString();
      const [
        all,
        open,
        processing,
        resolved,
        closed,
        overdue,
        low,
        medium,
        high,
        urgent,
        hardware,
        software,
        network,
        access,
        other,
        recent,
      ] = await Promise.all([
        tickets.count(),
        tickets.count({ filter: { status: 'open' } }),
        tickets.count({ filter: { status: 'processing' } }),
        tickets.count({ filter: { status: 'resolved' } }),
        tickets.count({ filter: { status: 'closed' } }),
        tickets.count({
          filter: (filter) =>
            filter.and([
              filter.string('status').eq('processing'),
              filter.or([
                filter.date('statusChangedAt').before(cutoff),
                filter.date('lastReminderAt').notEmpty(),
              ]),
            ]),
        }),
        tickets.count({ filter: { priority: 'low' } }),
        tickets.count({ filter: { priority: 'medium' } }),
        tickets.count({ filter: { priority: 'high' } }),
        tickets.count({ filter: { priority: 'urgent' } }),
        tickets.count({ filter: { category: 'hardware' } }),
        tickets.count({ filter: { category: 'software' } }),
        tickets.count({ filter: { category: 'network' } }),
        tickets.count({ filter: { category: 'access' } }),
        tickets.count({ filter: { category: 'other' } }),
        tickets.findMany({
          sort: (sort) => sort.field('createdAt').desc(),
          limit: 8,
        }),
      ]);
      const names = await personNames(
        app,
        recent.flatMap((ticket) => [ticket.reporterId, ticket.assigneeId]),
      );
      const engineers = app.container.has(userManagementServiceToken)
        ? await app.container.resolve(userManagementServiceToken).list({
            roleScope: 'app',
            role: 'helpdesk-engineer',
            pageSize: 200,
            status: 'enabled',
            sort: 'name',
            order: 'asc',
          })
        : { items: [] as const };
      const workload = await Promise.all(
        engineers.items.map(async (engineer) => {
          const assigned = (status?: string) =>
            tickets.count({
              filter: (filter) =>
                filter.and([
                  filter.string('assigneeId').eq(String(engineer.id)),
                  ...(status ? [filter.string('status').eq(status)] : []),
                ]),
            });
          const [processingCount, resolvedCount, closedCount, totalCount] =
            await Promise.all([
              assigned('processing'),
              assigned('resolved'),
              assigned('closed'),
              assigned(),
            ]);
          return {
            id: String(engineer.id),
            name: engineer.name ?? null,
            email: engineer.email ?? null,
            processing: processingCount,
            resolved: resolvedCount,
            closed: closedCount,
            total: totalCount,
          };
        }),
      );
      return context.json({
        data: {
          totals: { all, open, processing, resolved, closed, overdue },
          byPriority: { low, medium, high, urgent },
          byCategory: { hardware, software, network, access, other },
          recent: recent.map((ticket) => withPeople(ticket, names)),
          workload,
          reminderHours: settings.reminderHours,
        },
      });
    },
  );

  routes.get(
    '/settings',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Read helpdesk reminder settings',
      operationId: 'getHelpdeskSettings',
      responses: {
        '200': dataResponse(HelpdeskSettingsSchema, 'The settings.'),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      await requireSetting(context.get('authz'), 'helpdesk.reminders', 'read');
      const settings = await readHelpdeskSettings(database);
      return context.json({
        data: {
          reminderHours: settings.reminderHours,
          updatedAt: settings.updatedAt,
        },
      });
    },
  );

  routes.put(
    '/settings',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Update helpdesk reminder settings',
      operationId: 'updateHelpdeskSettings',
      responses: {
        '200': dataResponse(HelpdeskSettingsSchema, 'The saved settings.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', UpdateSettingsInput),
    async (context) => {
      await requireSetting(
        context.get('authz'),
        'helpdesk.reminders',
        'update',
      );
      const { id } = actorOf(context);
      const input = context.req.valid('json');
      const settings = await writeHelpdeskSettings(
        database,
        input.reminderHours,
        id,
      );
      return context.json({
        data: {
          reminderHours: settings.reminderHours,
          updatedAt: settings.updatedAt,
        },
      });
    },
  );

  routes.get(
    '/workflow/definition',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Read the ticket lifecycle definition',
      operationId: 'getHelpdeskWorkflowDefinition',
      responses: {
        '200': dataResponse(
          WorkflowDefinitionSchema,
          'The lifecycle definition and diagram.',
        ),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      await requireSetting(context.get('authz'), 'helpdesk.workflow', 'read');
      const runtime = app.container.resolve(helpdeskLifecycleRuntimeToken);
      const view = lifecycleDescriptionView(runtime, LIFECYCLE);
      const states = view.description.states.map((state) => ({
        name: state,
        title:
          view.description.stateInfo.find((info) => info.name === state)
            ?.title ?? state,
        final:
          view.description.stateInfo.find((info) => info.name === state)
            ?.final ?? false,
      }));
      return context.json({
        data: {
          ...view.description,
          states,
          diagram: view.diagram,
        },
      });
    },
  );

  routes.get(
    '/workflow/executions',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'List ticket lifecycle executions',
      operationId: 'listHelpdeskWorkflowExecutions',
      responses: {
        '200': listResponse(
          WorkflowExecutionSchema,
          undefined,
          'Lifecycle transitions and their effects.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', WorkflowExecutionsQuery),
    async (context) => {
      await requireSetting(context.get('authz'), 'helpdesk.workflow', 'read');
      const query = context.req.valid('query');
      const filter = (filterBuilder: FilterBuilder) =>
        filterBuilder.and([
          filterBuilder.string('lifecycle').eq(LIFECYCLE),
          ...(query.ticketId
            ? [filterBuilder.string('recordId').eq(query.ticketId)]
            : []),
        ]);
      const transitionsRepository = database.repository<
        Record<string, unknown>
      >('lifecycleTransitions');
      const transitions = await transitionsRepository.findMany({
        filter,
        sort: (sort) => sort.field('id').desc(),
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      });
      const total = await transitionsRepository.count({ filter });
      const transitionIds = transitions.map((row) => Number(row.id));
      const runs = transitionIds.length
        ? await database
            .repository<Record<string, unknown>>('lifecycleEffectRuns')
            .findMany({
              filter: (filter) =>
                filter.or(
                  transitionIds.map((id) =>
                    filter.number('transitionId').eq(id),
                  ),
                ),
              sort: (sort) => sort.field('id').asc(),
            })
        : [];
      const recordIds = [
        ...new Set(transitions.map((row) => String(row.recordId))),
      ];
      const tickets = recordIds.length
        ? await ticketRepository(database).findMany({
            filter: (filter) =>
              filter.or(recordIds.map((id) => filter.string('id').eq(id))),
          })
        : [];
      const ticketsById = new Map(
        tickets.map((ticket) => [String(ticket.id), ticket]),
      );
      const runsByTransition = new Map<number, Record<string, unknown>[]>();
      for (const run of runs) {
        if (query.status && run.status !== query.status) continue;
        const key = Number(run.transitionId);
        runsByTransition.set(key, [...(runsByTransition.get(key) ?? []), run]);
      }
      return context.json({
        data: transitions.map((transition) => ({
          transition,
          effectRuns: runsByTransition.get(Number(transition.id)) ?? [],
          ticket: ticketsById.get(String(transition.recordId)) ?? null,
        })),
        meta: { page: query.page, pageSize: query.pageSize, total },
      });
    },
  );

  routes.get(
    '/workflow/executions/:transitionId',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Get one ticket lifecycle execution',
      operationId: 'getHelpdeskWorkflowExecution',
      responses: {
        '200': dataResponse(
          WorkflowExecutionSchema,
          'The transition, its effects and ticket.',
        ),
        ...apiErrorResponses,
        '404': apiErrorResponse(404),
      },
    }),
    apiValidator('param', WorkflowExecutionParams),
    async (context) => {
      await requireSetting(context.get('authz'), 'helpdesk.workflow', 'read');
      const { transitionId } = context.req.valid('param');
      const transition = await database
        .repository<Record<string, unknown>>('lifecycleTransitions')
        .findOne({ filter: { id: transitionId, lifecycle: LIFECYCLE } });
      if (!transition)
        throw notFound('The lifecycle transition was not found.');
      const effectRuns = await database
        .repository<Record<string, unknown>>('lifecycleEffectRuns')
        .findMany({
          filter: { transitionId },
          sort: (sort) => sort.field('id').asc(),
        });
      const ticket = await ticketRepository(database).findOne({
        filter: { id: String(transition.recordId) },
      });
      const history = await database
        .repository<Record<string, unknown>>('lifecycleTransitions')
        .findMany({
          filter: {
            lifecycle: LIFECYCLE,
            recordId: String(transition.recordId),
          },
          sort: (sort) => sort.field('id').asc(),
        });
      return context.json({
        data: {
          transition,
          effectRuns,
          ticket: ticket ?? null,
          history,
        },
      });
    },
  );

  // A system-only reminder can be triggered by an operator who holds the
  // workflow setting; the scheduler fires it on its own as well.
  routes.post(
    '/workflow/remind/:ticketId',
    describeRoute({
      tags: ['Helpdesk'],
      summary: 'Run the overdue reminder for one ticket',
      operationId: 'runHelpdeskOverdueReminder',
      responses: {
        '200': dataResponse(TicketViewSchema, 'The ticket after the reminder.'),
        ...apiErrorResponses,
        '404': apiErrorResponse(404),
      },
    }),
    apiValidator('param', TicketParams),
    async (context) => {
      await requireSetting(context.get('authz'), 'helpdesk.workflow', 'read');
      const { ticketId } = context.req.valid('param');
      const runtime = app.container.resolve(helpdeskLifecycleRuntimeToken);
      try {
        await runtime.fire(LIFECYCLE, ticketId, 'remind', {
          manual: false,
          actor: SYSTEM_ACTOR,
          input: {},
        });
        return context.json({
          data: await readView(runtime, ticketId, SYSTEM_ACTOR),
        });
      } catch (error) {
        return lifecycleFailure(error);
      }
    },
  );

  router.route('/helpdesk', routes);
  return router as unknown as Hono;
}

export const helpdeskApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => createHelpdeskRoutes(app));
