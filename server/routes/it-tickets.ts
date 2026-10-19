import type { Application } from '@nocobase/app-server/application';
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
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { Hono } from 'hono';

import { ItTicketError } from '../services/it-ticket-service.js';
import { itTicketServiceToken } from '../services/it-ticket-token.js';
import {
  AssignTicketInput,
  CommentTicketInput,
  CreateTicketInput,
  ProgressTicketInput,
  ResolveTicketInput,
  ReturnTicketInput,
  SampleDataResult,
  TicketDashboard,
  TicketDetail,
  TicketEngineer,
  TicketListMeta,
  TicketListQuery,
  TicketParams,
  TicketSummary,
} from './schemas.js';

const DOMAIN = 'itTickets';

/** Turns the service's domain errors into the application's standard API errors. */
function toApiError(error: unknown): unknown {
  if (!(error instanceof ItTicketError)) return error;

  if (error.status === 403) {
    return new ApiError({
      status: 'PERMISSION_DENIED',
      reason: error.code,
      domain: DOMAIN,
      message: error.message,
    });
  }
  if (error.status === 404) {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: error.code,
      domain: DOMAIN,
      message: error.message,
    });
  }
  if (error.status === 409) {
    return new ApiError({
      status: 'ABORTED',
      reason: error.code,
      domain: DOMAIN,
      message: error.message,
    });
  }
  const field =
    error.code === 'ASSIGNEE_INVALID'
      ? 'assigneeId'
      : error.code === 'ATTACHMENT_INVALID'
        ? 'fileIds'
        : undefined;
  return new ApiError({
    status: 'INVALID_ARGUMENT',
    reason: error.code,
    domain: DOMAIN,
    message: error.message,
    fieldViolations: field
      ? [{ field, description: error.message, reason: error.code }]
      : undefined,
  });
}

export const itTicketRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv & AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const service = app.container.resolve(itTicketServiceToken);

    // This router is mounted only at `/tickets`, so the middleware is scoped to
    // this feature rather than to the application's whole API. File uploads are
    // guarded separately by the provider.
    routes.use('*', auth.required(), authorization.middleware());

    routes.onError((error, context) =>
      apiErrorHandler(toApiError(error), context),
    );

    routes.get(
      '/',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'List IT tickets visible to the caller',
        operationId: 'listItTickets',
        responses: {
          '200': listResponse(
            TicketSummary,
            TicketListMeta,
            'A page of tickets the caller may view.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', TicketListQuery),
      async (context) => {
        const result = await service.list(
          context.get('authz'),
          context.req.valid('query'),
        );
        return context.json({
          data: result.items,
          meta: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
          },
        });
      },
    );

    routes.get(
      '/engineers',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'List engineers a service desk user may assign',
        operationId: 'listItTicketEngineers',
        responses: {
          '200': dataResponse(
            TicketEngineer.array(),
            'IT engineers available for assignment.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) =>
        context.json({
          data: await service.engineers(context.get('authz')),
        }),
    );

    routes.get(
      '/dashboard',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Get the IT service desk dashboard',
        operationId: 'getItTicketDashboard',
        responses: {
          '200': dataResponse(
            TicketDashboard,
            'Counts, engineer workload, and the most recent tickets.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) =>
        context.json({
          data: await service.dashboard(context.get('authz')),
        }),
    );

    routes.post(
      '/sample-data',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Load the IT service desk demonstration data',
        operationId: 'loadItTicketSampleData',
        description:
          'Creates the demo people and tickets, including one overdue ticket, and sends any newly due overdue reminder. The operation is idempotent.',
        responses: {
          '200': dataResponse(
            SampleDataResult,
            'How many overdue reminders the load sent.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) =>
        context.json({
          data: await service.loadSampleData(context.get('authz')),
        }),
    );

    routes.get(
      '/:ticketId',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Get an IT ticket with its timeline and attachments',
        operationId: 'getItTicket',
        responses: {
          '200': dataResponse(TicketDetail, 'The ticket.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(
            404,
            'The ticket does not exist or is not visible.',
          ),
        },
      }),
      apiValidator('param', TicketParams),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        return context.json({
          data: await service.detail(context.get('authz'), ticketId),
        });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Submit an IT ticket',
        operationId: 'createItTicket',
        responses: {
          '201': dataResponse(TicketDetail, 'The submitted ticket.'),
          ...apiErrorResponses,
          '400': apiErrorResponse(
            400,
            'A screenshot is not an unclaimed upload of the caller (`ATTACHMENT_INVALID`).',
          ),
        },
      }),
      apiValidator('json', CreateTicketInput),
      async (context) => {
        const input = context.req.valid('json');
        return context.json(
          {
            data: await service.create(context.get('authz'), input),
          },
          201,
        );
      },
    );

    routes.post(
      '/:ticketId/assign',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Assign an IT engineer to a ticket',
        operationId: 'assignItTicket',
        responses: {
          '200': dataResponse(TicketDetail, 'The updated ticket.'),
          ...apiErrorResponses,
          '400': apiErrorResponse(
            400,
            'The assignee is not an active person (`ASSIGNEE_INVALID`).',
          ),
          '404': apiErrorResponse(
            404,
            'The ticket does not exist or is not visible.',
          ),
          '409': apiErrorResponse(
            409,
            'The ticket is no longer waiting for assignment (`INVALID_STATE`).',
          ),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', AssignTicketInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { assigneeId } = context.req.valid('json');
        return context.json({
          data: await service.assign(
            context.get('authz'),
            ticketId,
            assigneeId,
          ),
        });
      },
    );

    routes.post(
      '/:ticketId/progress',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Record progress on an assigned ticket',
        operationId: 'progressItTicket',
        responses: {
          '200': dataResponse(TicketDetail, 'The updated ticket.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(
            404,
            'The ticket does not exist or is not visible.',
          ),
          '409': apiErrorResponse(
            409,
            'The ticket is not in progress (`INVALID_STATE`).',
          ),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', ProgressTicketInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { content } = context.req.valid('json');
        return context.json({
          data: await service.progress(context.get('authz'), ticketId, content),
        });
      },
    );

    routes.post(
      '/:ticketId/resolve',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Resolve an in-progress ticket',
        operationId: 'resolveItTicket',
        responses: {
          '200': dataResponse(TicketDetail, 'The updated ticket.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(
            404,
            'The ticket does not exist or is not visible.',
          ),
          '409': apiErrorResponse(
            409,
            'The ticket is not in progress (`INVALID_STATE`).',
          ),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', ResolveTicketInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { resolution } = context.req.valid('json');
        return context.json({
          data: await service.resolve(
            context.get('authz'),
            ticketId,
            resolution,
          ),
        });
      },
    );

    routes.post(
      '/:ticketId/close',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Confirm the resolution and close a ticket',
        operationId: 'closeItTicket',
        responses: {
          '200': dataResponse(TicketDetail, 'The updated ticket.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(
            404,
            'The ticket does not exist or is not visible.',
          ),
          '409': apiErrorResponse(
            409,
            'The ticket is not resolved (`INVALID_STATE`).',
          ),
        },
      }),
      apiValidator('param', TicketParams),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        return context.json({
          data: await service.close(context.get('authz'), ticketId),
        });
      },
    );

    routes.post(
      '/:ticketId/return',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Return a resolved ticket for further handling',
        operationId: 'returnItTicket',
        responses: {
          '200': dataResponse(TicketDetail, 'The updated ticket.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(
            404,
            'The ticket does not exist or is not visible.',
          ),
          '409': apiErrorResponse(
            409,
            'The ticket is not resolved (`INVALID_STATE`).',
          ),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', ReturnTicketInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { reason } = context.req.valid('json');
        return context.json({
          data: await service.returnTicket(
            context.get('authz'),
            ticketId,
            reason,
          ),
        });
      },
    );

    routes.post(
      '/:ticketId/comments',
      describeRoute({
        tags: ['IT tickets'],
        summary: 'Add a comment to an IT ticket',
        operationId: 'commentOnItTicket',
        responses: {
          '200': dataResponse(TicketDetail, 'The updated ticket.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(
            404,
            'The ticket does not exist or is not visible.',
          ),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', CommentTicketInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { content } = context.req.valid('json');
        return context.json({
          data: await service.comment(context.get('authz'), ticketId, content),
        });
      },
    );

    router.route('/tickets', routes);
    return router;
  });
