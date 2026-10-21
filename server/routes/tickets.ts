import { z } from 'zod';

import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '../tickets/service.js';
import { ticketServiceToken } from '../tickets/token.js';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

const AttachmentSchema = z.object({
  id: z.string(),
  fileId: z.string(),
  commentId: z.string().nullable(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  createdAt: z.string(),
  contentUrl: z.string(),
});

const CommentSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  authorId: z.string(),
  author: UserSchema.nullable(),
  body: z.string(),
  internal: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  attachments: z.array(AttachmentSchema),
});

const TicketListItemSchema = z.object({
  id: z.string(),
  ticketNo: z.string(),
  title: z.string(),
  status: z.enum(TICKET_STATUSES),
  priority: z.enum(TICKET_PRIORITIES),
  category: z.enum(TICKET_CATEGORIES),
  requesterId: z.string(),
  requester: UserSchema.nullable(),
  assigneeId: z.string().nullable(),
  assignee: UserSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  overdue: z.boolean(),
  slaDeadline: z.string(),
});

const TicketDetailSchema = TicketListItemSchema.extend({
  description: z.string(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  comments: z.array(CommentSchema),
  attachments: z.array(AttachmentSchema),
  viewer: z.object({
    canCommentInternal: z.boolean(),
    canAssign: z.boolean(),
    canResolve: z.boolean(),
    canClose: z.boolean(),
    canReopen: z.boolean(),
  }),
});

const TicketWorkloadSchema = z.object({
  user: UserSchema,
  active: z.number(),
  overdue: z.number(),
});

const TicketDashboardSchema = z.object({
  viewer: z.object({ serviceDesk: z.boolean() }),
  counts: z.object({
    open: z.number(),
    inProgress: z.number(),
    resolved: z.number(),
    closed: z.number(),
    active: z.number(),
    unassigned: z.number(),
    overdue: z.number(),
  }),
  unassigned: z.array(TicketListItemSchema),
  overdue: z.array(TicketListItemSchema),
  awaitingConfirmation: z.array(TicketListItemSchema),
  recent: z.array(TicketListItemSchema),
  workload: z.array(TicketWorkloadSchema),
});

const TicketMetaSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

const ListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const TicketParams = z.object({ ticketId: z.string().uuid() });

const AttachmentParams = z.object({
  ticketId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

const CreateTicketInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(20_000),
  priority: z.enum(TICKET_PRIORITIES).default('medium'),
  category: z.enum(TICKET_CATEGORIES).default('other'),
});

const CreateCommentInput = z.object({
  body: z.string().trim().min(1).max(10_000),
  internal: z.boolean().default(false),
});

const AssignTicketInput = z.object({
  assigneeId: z.string().min(1).max(64),
});

const AcceptTicketInput = z.object({
  assigneeId: z.string().min(1).max(64).optional(),
});

const UploadAttachmentForm = z.object({
  file: z.instanceof(File),
  commentId: z.string().uuid().optional(),
});

const TAGS = ['Tickets'];

export const ticketApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const tickets = app.container.resolve(ticketServiceToken);

    routes.use('*', auth.required(), authorization.middleware());

    routes.get(
      '/',
      describeRoute({
        tags: TAGS,
        summary: 'List the tickets this user may read',
        operationId: 'listTickets',
        responses: {
          '200': listResponse(TicketListItemSchema, TicketMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListQuery),
      async (context) => {
        const { page, pageSize, ...filters } = context.req.valid('query');
        const result = await tickets.list(context.get('authz'), {
          ...filters,
          page,
          pageSize,
        });
        return context.json({
          data: result.rows,
          meta: { page, pageSize, total: result.total },
        });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags: TAGS,
        summary: 'Create a ticket',
        operationId: 'createTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateTicketInput),
      async (context) => {
        const ticket = await tickets.create(
          context.get('authz'),
          context.req.valid('json'),
        );
        return context.json({ data: ticket });
      },
    );

    routes.get(
      '/dashboard',
      describeRoute({
        tags: TAGS,
        summary: 'Service-desk work queue, SLA and engineer workload',
        operationId: 'getTicketDashboard',
        responses: {
          '200': dataResponse(TicketDashboardSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const dashboard = await tickets.dashboard(context.get('authz'));
        return context.json({ data: dashboard });
      },
    );

    routes.get(
      '/engineers',
      describeRoute({
        tags: TAGS,
        summary: 'People a ticket may be dispatched to',
        operationId: 'listTicketEngineers',
        responses: {
          '200': listResponse(UserSchema, z.object({ total: z.number() })),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const engineers = await tickets.engineers(context.get('authz'));
        return context.json({
          data: engineers,
          meta: { total: engineers.length },
        });
      },
    );

    routes.get(
      '/:ticketId',
      describeRoute({
        tags: TAGS,
        summary: 'Read one ticket with its comments and attachments',
        operationId: 'getTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', TicketParams),
      async (context) => {
        const ticket = await tickets.get(
          context.get('authz'),
          context.req.valid('param').ticketId,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/:ticketId/comments',
      describeRoute({
        tags: TAGS,
        summary: 'Add a comment or an internal note',
        operationId: 'addTicketComment',
        responses: {
          '200': dataResponse(CommentSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', CreateCommentInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { body, internal } = context.req.valid('json');
        const comment = await tickets.addComment(
          context.get('authz'),
          ticketId,
          body,
          internal,
        );
        return context.json({ data: comment });
      },
    );

    routes.post(
      '/:ticketId/assign',
      describeRoute({
        tags: TAGS,
        summary: 'Dispatch a ticket to a specific engineer',
        operationId: 'assignTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(409),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', AssignTicketInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { assigneeId } = context.req.valid('json');
        const ticket = await tickets.assign(
          context.get('authz'),
          ticketId,
          assigneeId,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/:ticketId/accept',
      describeRoute({
        tags: TAGS,
        summary: 'Accept a ticket and assign it to its maintainer',
        operationId: 'acceptTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(409),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', AcceptTicketInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { assigneeId } = context.req.valid('json');
        const ticket = await tickets.accept(
          context.get('authz'),
          ticketId,
          assigneeId,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/:ticketId/resolve',
      describeRoute({
        tags: TAGS,
        summary: 'Resolve an accepted ticket',
        operationId: 'resolveTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(409),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', z.object({}).optional().default({})),
      async (context) => {
        const ticket = await tickets.resolve(
          context.get('authz'),
          context.req.valid('param').ticketId,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/:ticketId/close',
      describeRoute({
        tags: TAGS,
        summary: 'Close a resolved ticket',
        operationId: 'closeTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(409),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', z.object({}).optional().default({})),
      async (context) => {
        const ticket = await tickets.close(
          context.get('authz'),
          context.req.valid('param').ticketId,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/:ticketId/reopen',
      describeRoute({
        tags: TAGS,
        summary: 'Send a resolved or closed ticket back to processing',
        operationId: 'reopenTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(409),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', z.object({}).optional().default({})),
      async (context) => {
        const ticket = await tickets.reopen(
          context.get('authz'),
          context.req.valid('param').ticketId,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/:ticketId/attachments',
      describeRoute({
        tags: TAGS,
        summary: 'Upload a screenshot or attachment',
        operationId: 'uploadTicketAttachment',
        responses: {
          '200': dataResponse(AttachmentSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '413': apiErrorResponse(413),
          '415': apiErrorResponse(415),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('form', UploadAttachmentForm),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { file, commentId } = context.req.valid('form');
        const attachment = await tickets.uploadAttachment(
          context.get('authz'),
          ticketId,
          file,
          commentId,
        );
        return context.json({ data: attachment });
      },
    );

    routes.get(
      '/:ticketId/attachments/:attachmentId/content',
      describeRoute({
        tags: TAGS,
        summary: 'Download an authorized attachment',
        operationId: 'downloadTicketAttachment',
        responses: {
          '200': {
            description: 'The attachment content.',
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
        const file = await tickets.downloadAttachment(
          context.get('authz'),
          ticketId,
          attachmentId,
        );
        const ascii = file.filename
          .replace(/[^\x20-\x7e]/g, '_')
          .replace(/["\\]/g, '_');
        context.header('Content-Type', file.mimeType);
        context.header(
          'Content-Disposition',
          `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        );
        context.header('X-Content-Type-Options', 'nosniff');
        return context.body(file.stream);
      },
    );

    router.route('/tickets', routes);
    return router;
  });
