import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  ApiError,
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
  AuthorizationDeniedError,
  type AuthorizationContext,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono } from 'hono';

import {
  TicketNotFoundError,
  TicketStateError,
  ticketServiceToken,
  type TicketService,
} from '../providers/tickets.js';
import { TICKET_RESOURCE } from '../tickets-resources.js';
import {
  CompleteTicketInputSchema,
  CreateTicketInputSchema,
  ListTicketsQuerySchema,
  TicketIdParamSchema,
  TicketListMetaSchema,
  TicketSchema,
} from './schemas.js';

/**
 * Resolve the caller's `tickets` policy for one action. A denied action, or a
 * composite decision with no policy for the collection, is a 403. A policy
 * whose scope selects nothing matches no rows, so reads return nothing.
 */
async function ticketPolicy(
  context: { get(key: 'authz'): AuthorizationContext },
  action: 'view' | 'create' | 'start' | 'complete',
): Promise<RepositoryPolicy> {
  const decision = await context.get('authz').authorize({
    resource: { type: 'composite', id: TICKET_RESOURCE },
    action,
  });
  const policy = decision.conditions?.database?.tickets;
  if (decision.effect === 'deny' || !policy) {
    throw new AuthorizationDeniedError(decision);
  }
  return policy;
}

/**
 * The policy of a route that writes a ticket: it writes under the action's own
 * grant and reads under `view`. The composite actions `create`, `start` and
 * `complete` compose only the database operation they change, and every
 * repository write reads the row back; resolving `view` too keeps that read
 * inside the caller's ticket scope instead of failing as a forbidden read.
 */
async function ticketWritePolicy(
  context: { get(key: 'authz'): AuthorizationContext },
  action: 'create' | 'start' | 'complete',
): Promise<RepositoryPolicy> {
  const [view, write] = await Promise.all([
    ticketPolicy(context, 'view'),
    ticketPolicy(context, action),
  ]);
  return {
    read: view.read,
    create: write.create,
    update: write.update,
    delete: write.delete,
  };
}

/** Domain failures become standard `/api` errors; anything else is a server fault. */
function translate(error: unknown): never {
  if (error instanceof TicketNotFoundError) {
    throw new ApiError({
      status: 'NOT_FOUND',
      reason: error.reason,
      domain: 'tickets',
      message: error.message,
    });
  }
  if (error instanceof TicketStateError) {
    throw new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: error.reason,
      domain: 'tickets',
      message: error.message,
    });
  }
  throw error;
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const service: TicketService = app.container.resolve(ticketServiceToken);

    // The typed sub-router owns `/tickets` and everything under it; it installs
    // its own session and authorization middleware rather than inheriting any.
    const routes = new Hono<AuthEnv & AuthorizationEnv>();
    routes.use('*', auth.required(), authz.middleware());

    routes.get(
      '/',
      describeRoute({
        tags: ['Tickets'],
        summary: 'List tickets',
        operationId: 'listTickets',
        responses: {
          '200': listResponse(TicketSchema, TicketListMetaSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListTicketsQuerySchema),
      async (context) => {
        const policy = await ticketPolicy(context, 'view');
        const query = context.req.valid('query');
        const result = await service.list(policy, query);
        return context.json({
          data: result.items,
          meta: {
            total: result.total,
            page: query.page,
            pageSize: query.pageSize,
          },
        });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Submit a ticket',
        operationId: 'createTicket',
        responses: {
          '201': dataResponse(TicketSchema, 'The submitted ticket.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateTicketInputSchema),
      async (context) => {
        const policy = await ticketWritePolicy(context, 'create');
        const session = context.get('auth');
        if (!session) {
          throw new AuthorizationDeniedError({ effect: 'deny', reasons: [] });
        }
        const input = context.req.valid('json');
        const ticket = await service.create(policy, {
          title: input.title,
          category: input.category,
          description: input.description ?? null,
          submitterId: session.user.id,
        });
        return context.json({ data: ticket }, 201);
      },
    );

    routes.get(
      '/:ticketId',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Get a ticket',
        operationId: 'getTicket',
        responses: {
          '200': dataResponse(TicketSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', TicketIdParamSchema),
      async (context) => {
        const policy = await ticketPolicy(context, 'view');
        const { ticketId } = context.req.valid('param');
        const ticket = await service.get(policy, ticketId);
        if (!ticket) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'TICKET_NOT_FOUND',
            domain: 'tickets',
            message: `Ticket ${ticketId} was not found.`,
          });
        }
        return context.json({ data: ticket });
      },
    );

    routes.post(
      '/:ticketId/start',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Start handling a ticket',
        operationId: 'startTicket',
        responses: {
          '200': dataResponse(TicketSchema, 'The ticket, now in progress.'),
          ...apiErrorResponses,
          // The state precondition fails, not the input.
          '400': apiErrorResponse(400, 'The ticket is not pending.'),
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', TicketIdParamSchema),
      async (context) => {
        const policy = await ticketWritePolicy(context, 'start');
        const session = context.get('auth');
        if (!session) {
          throw new AuthorizationDeniedError({ effect: 'deny', reasons: [] });
        }
        const { ticketId } = context.req.valid('param');
        try {
          const ticket = await service.start(policy, ticketId, session.user.id);
          return context.json({ data: ticket });
        } catch (error) {
          translate(error);
        }
      },
    );

    routes.post(
      '/:ticketId/complete',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Complete a ticket',
        operationId: 'completeTicket',
        responses: {
          '200': dataResponse(TicketSchema, 'The completed ticket.'),
          ...apiErrorResponses,
          '400': apiErrorResponse(400, 'The ticket is not in progress.'),
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', TicketIdParamSchema),
      apiValidator('json', CompleteTicketInputSchema),
      async (context) => {
        const policy = await ticketWritePolicy(context, 'complete');
        const { ticketId } = context.req.valid('param');
        const { resolution } = context.req.valid('json');
        try {
          const ticket = await service.complete(policy, ticketId, resolution);
          return context.json({ data: ticket });
        } catch (error) {
          translate(error);
        }
      },
    );

    const router = new Hono();
    router.route('/tickets', routes);
    return router;
  },
);
