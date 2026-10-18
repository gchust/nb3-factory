import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
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
  type ApiResponseObject,
} from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { Hono, type MiddlewareHandler } from 'hono';

import { ServiceDeskError } from '../../service-desk/domain.js';
import { SERVICE_DESK_RESOURCE } from '../../service-desk/resources.js';
import { serviceDeskServiceToken } from '../../service-desk/tokens.js';
import {
  AssignTicketBody,
  CommentBody,
  CreateTicketBody,
  Dashboard,
  Engineer,
  ResolveTicketBody,
  ReturnTicketBody,
  Ticket,
  TicketDetail,
  TicketListQuery,
  TicketParams,
} from './schemas.js';

/** The environment the service desk's routers run in. */
type ServiceDeskEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

const TAGS = ['Service Desk'];
/** The application's own error domain: the reasons the workflow service raises. */
const DOMAIN = 'serviceDesk';

/** One route-specific `400` for a valid request the ticket's state forbids. */
const invalidTransition: ApiResponseObject = apiErrorResponse(
  400,
  'The ticket is not in a state that allows this action (`TICKET_INVALID_TRANSITION`).',
);
const conflict: ApiResponseObject = apiErrorResponse(
  409,
  'The ticket changed while the request was being handled (`TICKET_CONFLICT`).',
);
const notFound: ApiResponseObject = apiErrorResponse(
  404,
  'The ticket does not exist or is not visible to the caller (`TICKET_NOT_FOUND`).',
);

/**
 * Maps the workflow's domain errors onto the HTTP API's fixed status set. The
 * service decides which business rule was broken; the route decides what that
 * means on the wire.
 */
function toApiError(error: ServiceDeskError): ApiError {
  switch (error.code) {
    case 'TICKET_NOT_FOUND':
      return new ApiError({
        status: 'NOT_FOUND',
        reason: error.code,
        domain: DOMAIN,
        message: error.message,
      });
    case 'INVALID_TRANSITION':
      return new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: error.code,
        domain: DOMAIN,
        message: error.message,
      });
    case 'INVALID_ASSIGNEE':
      return new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: error.code,
        domain: DOMAIN,
        message: error.message,
        fieldViolations: [{ field: 'assigneeId', description: error.message }],
      });
    case 'TICKET_CONFLICT':
      return new ApiError({
        status: 'ABORTED',
        reason: error.code,
        domain: DOMAIN,
        message: error.message,
      });
    case 'INVALID_ARGUMENT':
      return new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: error.code,
        domain: DOMAIN,
        message: error.message,
      });
  }
}

/**
 * Checks the composite resource before a route's validators run, so an
 * unauthorized caller gets `403` without learning what input the route
 * expects. The service checks the same action again where it acts on data.
 */
function requireAction(action: string): MiddlewareHandler<ServiceDeskEnv> {
  return async (context, next) => {
    const decision = await context.get('authz').authorize({
      resource: { type: 'composite', id: SERVICE_DESK_RESOURCE },
      action,
    });
    if (decision.effect === 'deny') {
      throw new AuthorizationDeniedError(decision);
    }
    await next();
  };
}

export function createServiceDeskRouter(app: Application): Hono {
  const router = new Hono<ServiceDeskEnv>();
  router.onError((error, context) =>
    apiErrorHandler(
      error instanceof ServiceDeskError ? toApiError(error) : error,
      context,
    ),
  );

  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const workflow = app.container.resolve(serviceDeskServiceToken);

  for (const path of ['/tickets', '/tickets/*', '/engineers']) {
    router.use(path, auth.required(), authorization.middleware());
  }

  // The dashboard is a computation over the whole collection, not a ticket id;
  // it is registered before `/tickets/:ticketId` so the fixed segment wins.
  router.get(
    '/tickets/dashboard',
    requireAction('dashboard'),
    describeRoute({
      tags: TAGS,
      summary: 'Read the service desk dashboard',
      operationId: 'serviceDeskDashboard',
      responses: {
        '200': dataResponse(Dashboard, 'The current service desk figures.'),
        ...apiErrorResponses,
      },
    }),
    async (context) =>
      context.json({ data: await workflow.dashboard(context.get('authz')) }),
  );

  router.get(
    '/tickets',
    requireAction('view'),
    describeRoute({
      tags: TAGS,
      summary: 'List tickets',
      operationId: 'serviceDeskListTickets',
      responses: {
        '200': listResponse(Ticket, undefined, 'A page of tickets.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', TicketListQuery),
    async (context) => {
      const page = await workflow.listTickets(
        context.get('authz'),
        context.req.valid('query'),
      );
      return context.json({
        data: page.items,
        meta: { total: page.total, page: page.page, pageSize: page.pageSize },
      });
    },
  );

  router.post(
    '/tickets',
    requireAction('create'),
    describeRoute({
      tags: TAGS,
      summary: 'Raise a ticket',
      operationId: 'serviceDeskCreateTicket',
      responses: {
        '201': dataResponse(Ticket, 'The ticket that was raised.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', CreateTicketBody),
    async (context) => {
      const ticket = await workflow.createTicket(
        context.get('authz'),
        context.req.valid('json'),
      );
      return context.json({ data: ticket }, 201);
    },
  );

  router.get(
    '/engineers',
    requireAction('assign'),
    describeRoute({
      tags: TAGS,
      summary: 'List the engineers a ticket may be assigned to',
      operationId: 'serviceDeskListEngineers',
      responses: {
        '200': listResponse(Engineer, undefined, 'The assignable engineers.'),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const engineers = await workflow.listEngineers(context.get('authz'));
      return context.json({
        data: engineers,
        meta: { total: engineers.length },
      });
    },
  );

  router.get(
    '/tickets/:ticketId',
    requireAction('view'),
    describeRoute({
      tags: TAGS,
      summary: 'Read one ticket',
      operationId: 'serviceDeskGetTicket',
      responses: {
        '200': dataResponse(TicketDetail, 'The ticket and its history.'),
        ...apiErrorResponses,
        '404': notFound,
      },
    }),
    apiValidator('param', TicketParams),
    async (context) => {
      const detail = await workflow.getTicketDetail(
        context.get('authz'),
        context.req.valid('param').ticketId,
      );
      if (!detail) {
        throw new ServiceDeskError(
          'TICKET_NOT_FOUND',
          `Ticket ${context.req.valid('param').ticketId} was not found.`,
        );
      }
      return context.json({ data: detail });
    },
  );

  router.post(
    '/tickets/:ticketId/assign',
    requireAction('assign'),
    describeRoute({
      tags: TAGS,
      summary: 'Assign a ticket to an engineer',
      operationId: 'serviceDeskAssignTicket',
      responses: {
        '200': dataResponse(TicketDetail, 'The updated ticket.'),
        ...apiErrorResponses,
        '400': invalidTransition,
        '404': notFound,
        '409': conflict,
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', AssignTicketBody),
    async (context) =>
      context.json({
        data: await workflow.assignTicket(
          context.get('authz'),
          context.req.valid('param').ticketId,
          context.req.valid('json'),
        ),
      }),
  );

  router.post(
    '/tickets/:ticketId/resolve',
    requireAction('resolve'),
    describeRoute({
      tags: TAGS,
      summary: 'Record a resolution',
      operationId: 'serviceDeskResolveTicket',
      responses: {
        '200': dataResponse(TicketDetail, 'The updated ticket.'),
        ...apiErrorResponses,
        '400': invalidTransition,
        '404': notFound,
        '409': conflict,
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', ResolveTicketBody),
    async (context) =>
      context.json({
        data: await workflow.resolveTicket(
          context.get('authz'),
          context.req.valid('param').ticketId,
          context.req.valid('json'),
        ),
      }),
  );

  router.post(
    '/tickets/:ticketId/confirm',
    requireAction('confirm'),
    describeRoute({
      tags: TAGS,
      summary: 'Confirm a resolution and close the ticket',
      operationId: 'serviceDeskConfirmTicket',
      responses: {
        '200': dataResponse(TicketDetail, 'The closed ticket.'),
        ...apiErrorResponses,
        '400': invalidTransition,
        '404': notFound,
        '409': conflict,
      },
    }),
    apiValidator('param', TicketParams),
    async (context) =>
      context.json({
        data: await workflow.confirmTicket(
          context.get('authz'),
          context.req.valid('param').ticketId,
        ),
      }),
  );

  router.post(
    '/tickets/:ticketId/return',
    requireAction('return'),
    describeRoute({
      tags: TAGS,
      summary: 'Return a resolution to the engineer',
      operationId: 'serviceDeskReturnTicket',
      responses: {
        '200': dataResponse(TicketDetail, 'The returned ticket.'),
        ...apiErrorResponses,
        '400': invalidTransition,
        '404': notFound,
        '409': conflict,
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', ReturnTicketBody),
    async (context) =>
      context.json({
        data: await workflow.returnTicket(
          context.get('authz'),
          context.req.valid('param').ticketId,
          context.req.valid('json'),
        ),
      }),
  );

  router.post(
    '/tickets/:ticketId/comments',
    requireAction('comment'),
    describeRoute({
      tags: TAGS,
      summary: 'Add a note to a ticket',
      operationId: 'serviceDeskCommentTicket',
      responses: {
        '200': dataResponse(TicketDetail, 'The ticket with the new note.'),
        ...apiErrorResponses,
        '404': notFound,
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', CommentBody),
    async (context) =>
      context.json({
        data: await workflow.addNote(
          context.get('authz'),
          context.req.valid('param').ticketId,
          context.req.valid('json'),
        ),
      }),
  );

  // `AppRouterFactory` erases the router's context variables, so the contribution is typed `Hono`;
  // the handlers above still see `ServiceDeskEnv` through this local router.
  return router as unknown as Hono;
}

export const apiRoutes = defineApiRoutes(createServiceDeskRouter);
