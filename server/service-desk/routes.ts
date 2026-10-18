import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { serviceDeskServiceToken } from './service-token.js';

const TicketStatusSchema = z.enum(['open', 'assigned', 'resolved', 'closed']);
const TicketPrioritySchema = z.enum(['urgent', 'high', 'normal', 'low']);

const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string(),
  size: z.number(),
  createdAt: z.string(),
});

const TicketSummarySchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  status: TicketStatusSchema,
  priority: TicketPrioritySchema,
  requesterId: z.string(),
  requesterName: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  slaDueAt: z.string(),
  assignedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  reopenedAt: z.string().nullable(),
  resolution: z.string().nullable(),
  attachments: z.array(AttachmentSchema),
  commentCount: z.number().int().nonnegative(),
  overdue: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const TicketActivitySchema = z.object({
  id: z.number().int().positive(),
  authorId: z.string(),
  authorName: z.string().nullable(),
  kind: z.enum([
    'created',
    'comment',
    'assigned',
    'resolved',
    'reopened',
    'confirmed',
  ]),
  body: z.string(),
  createdAt: z.string(),
});

const TicketDetailSchema = TicketSummarySchema.extend({
  activities: z.array(TicketActivitySchema),
  availableActions: z.array(z.string()),
});

const TicketListSchema = z.object({
  items: z.array(TicketSummarySchema),
  total: z.number().int().nonnegative(),
  canCreate: z.boolean(),
});

const EngineerWorkloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  active: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
});

const DashboardSchema = z.object({
  canCreate: z.boolean(),
  canAssign: z.boolean(),
  total: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  assigned: z.number().int().nonnegative(),
  unassigned: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  resolutionRate: z.number().min(0).max(100),
  byPriority: z.object({
    urgent: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    normal: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
  workload: z.array(EngineerWorkloadSchema),
  recent: z.array(TicketSummarySchema),
});

const AssigneeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

const UploadedAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string(),
  size: z.number(),
  createdAt: z.string(),
});

const TicketParams = z.object({
  ticketId: z.coerce.number().int().positive(),
});

const FileParams = z.object({
  ticketId: z.coerce.number().int().positive(),
  fileId: z.string().min(1),
});

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: TicketStatusSchema.optional(),
  priority: TicketPrioritySchema.optional(),
  q: z.string().trim().max(200).optional(),
});

const CreateTicketBody = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(10000),
  priority: TicketPrioritySchema.default('normal'),
  attachmentIds: z.array(z.string().uuid()).max(5).default([]),
});

const AssignBody = z.object({
  assigneeId: z.string().min(1),
});

const CommentBody = z.object({
  body: z.string().trim().min(1).max(5000),
});

const ResolveBody = z.object({
  resolution: z.string().trim().min(1).max(5000),
});

const ReopenBody = z.object({
  reason: z.string().trim().min(1).max(2000),
});

function requireFile(value: unknown): File {
  if (!(value instanceof File)) {
    throw new ApiError({
      status: 'INVALID_ARGUMENT',
      reason: 'FILE_REQUIRED',
      domain: 'service-desk',
      message: 'A file is required.',
      fieldViolations: [
        {
          field: 'file',
          description: 'A file is required.',
          reason: 'FILE_REQUIRED',
        },
      ],
    });
  }
  return value;
}

function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const serviceDeskRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const serviceDesk = app.container.resolve(serviceDeskServiceToken);
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);

    const routes = new Hono<AuthorizationEnv>();
    routes.use('*', auth.required(), authorization.middleware());

    routes.get(
      '/tickets',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'List visible service desk tickets',
        operationId: 'listServiceDeskTickets',
        responses: {
          '200': dataResponse(TicketListSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListQuery),
      async (context) => {
        const query = context.req.valid('query');
        const result = await serviceDesk.listTickets(context.get('authz'), {
          page: query.page,
          pageSize: query.pageSize,
          status: query.status,
          priority: query.priority,
          q: query.q || undefined,
        });
        return context.json({ data: result });
      },
    );

    routes.post(
      '/tickets',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'Create a service desk ticket',
        operationId: 'createServiceDeskTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          '400': apiErrorResponse(
            400,
            'An attachment is invalid or too many were supplied.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateTicketBody),
      async (context) => {
        const authz = context.get('authz');
        const ticket = await serviceDesk.createTicket(
          authz,
          authz.identity.principal.id,
          {
            ...context.req.valid('json'),
          },
        );
        return context.json({ data: ticket });
      },
    );

    routes.get(
      '/tickets/:ticketId',
      describeRoute({
        tags: ['Service Desk'],
        summary:
          'Read a service desk ticket with its activity and available actions',
        operationId: 'getServiceDeskTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      async (context) => {
        const ticket = await serviceDesk.getTicket(
          context.get('authz'),
          context.req.valid('param').ticketId,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/tickets/:ticketId/assign',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'Assign a ticket to a service desk engineer',
        operationId: 'assignServiceDeskTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          '400': apiErrorResponse(
            400,
            'The assignee is invalid or the ticket cannot be assigned.',
          ),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', AssignBody),
      async (context) => {
        const authz = context.get('authz');
        const ticket = await serviceDesk.assignTicket(
          authz,
          authz.identity.principal.id,
          context.req.valid('param').ticketId,
          context.req.valid('json').assigneeId,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/tickets/:ticketId/comments',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'Add a comment or progress update to a ticket',
        operationId: 'commentOnServiceDeskTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          '400': apiErrorResponse(400, 'The ticket is not open for comments.'),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', CommentBody),
      async (context) => {
        const authz = context.get('authz');
        const ticket = await serviceDesk.addComment(
          authz,
          authz.identity.principal.id,
          context.req.valid('param').ticketId,
          context.req.valid('json').body,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/tickets/:ticketId/resolve',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'Resolve a ticket with a resolution note',
        operationId: 'resolveServiceDeskTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          '400': apiErrorResponse(
            400,
            'The ticket cannot be resolved in its current state.',
          ),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', ResolveBody),
      async (context) => {
        const authz = context.get('authz');
        const ticket = await serviceDesk.resolveTicket(
          authz,
          authz.identity.principal.id,
          context.req.valid('param').ticketId,
          context.req.valid('json').resolution,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/tickets/:ticketId/confirm',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'Confirm a resolution and close the ticket',
        operationId: 'confirmServiceDeskTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          '400': apiErrorResponse(
            400,
            'Only a resolved ticket can be confirmed.',
          ),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      async (context) => {
        const authz = context.get('authz');
        const ticket = await serviceDesk.confirmTicket(
          authz,
          authz.identity.principal.id,
          context.req.valid('param').ticketId,
        );
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/tickets/:ticketId/reopen',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'Reopen a resolved or closed ticket',
        operationId: 'reopenServiceDeskTicket',
        responses: {
          '200': dataResponse(TicketDetailSchema),
          '400': apiErrorResponse(
            400,
            'The ticket cannot be reopened in its current state.',
          ),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', ReopenBody),
      async (context) => {
        const authz = context.get('authz');
        const ticket = await serviceDesk.reopenTicket(
          authz,
          authz.identity.principal.id,
          context.req.valid('param').ticketId,
          context.req.valid('json').reason,
        );
        return context.json({ data: ticket });
      },
    );

    routes.get(
      '/dashboard',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'Read service desk dashboard statistics',
        operationId: 'getServiceDeskDashboard',
        responses: {
          '200': dataResponse(DashboardSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const result = await serviceDesk.getDashboard(context.get('authz'));
        return context.json({ data: result });
      },
    );

    routes.get(
      '/assignees',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'List engineers a manager can assign tickets to',
        operationId: 'listServiceDeskAssignees',
        responses: {
          '200': dataResponse(z.array(AssigneeSchema)),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const result = await serviceDesk.listAssignees(context.get('authz'));
        return context.json({ data: result });
      },
    );

    routes.post(
      '/files',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'Upload a ticket attachment',
        operationId: 'uploadServiceDeskAttachment',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          '200': dataResponse(UploadedAttachmentSchema),
          '400': apiErrorResponse(
            400,
            'The file type or size is not accepted.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const body = await context.req.parseBody();
        const authz = context.get('authz');
        const uploaded = await serviceDesk.uploadAttachment(
          authz,
          authz.identity.principal.id,
          requireFile(body.file),
        );
        return context.json({ data: uploaded });
      },
    );

    routes.get(
      '/tickets/:ticketId/files/:fileId',
      describeRoute({
        tags: ['Service Desk'],
        summary: 'Download an attachment through its ticket',
        operationId: 'downloadServiceDeskAttachment',
        responses: {
          '200': {
            description: 'The attachment content.',
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', FileParams),
      async (context) => {
        const params = context.req.valid('param');
        const file = await serviceDesk.downloadAttachment(
          context.get('authz'),
          params.ticketId,
          params.fileId,
        );
        return new Response(Readable.toWeb(file.stream) as ReadableStream, {
          headers: {
            'Content-Type': file.mimeType,
            'Content-Length': String(file.size),
            'Content-Disposition': contentDisposition(
              file.filename,
              file.inline,
            ),
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=0, must-revalidate',
          },
        });
      },
    );

    const router = new Hono();
    router.route('/service-desk', routes);
    return router;
  });
