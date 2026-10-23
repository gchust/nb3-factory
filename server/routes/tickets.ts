import type { Application } from '@nocobase/app-server/application';
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
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  CreateTicketCommentInput,
  CreateTicketInput,
  FireTicketTransitionInput,
  ListExecutionsQuery,
  ListTicketsQuery,
  Ticket,
  TicketAssignee,
  TicketComment,
  TicketDashboard,
  TicketDefinition,
  TicketDetail,
  TicketExecutions,
  TicketLifecycleDescription,
  TicketPageMeta,
  TicketParams,
  TicketTransitionParams,
} from './schemas.js';
import {
  ticketServiceToken,
  type TicketActor,
} from '../providers/ticket-service.js';

type TicketEnv = AuthEnv & AuthorizationEnv;

/**
 * The signed-in person, as the ticket service records them.
 *
 * The name is denormalised into the ticket and its comments on purpose: a ticket must still read correctly after the
 * reporter's account is renamed or removed, and a record that only stores ids loses that history.
 */
function actorOf(context: {
  get: (key: 'auth') => AuthEnv['Variables']['auth'];
}): TicketActor {
  const auth = context.get('auth');
  const user = auth?.user;
  if (!user) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTHENTICATION_REQUIRED',
      domain: 'tickets',
      message: 'The ticket API needs a signed-in session.',
    });
  }
  return {
    id: String(user.id),
    name: String(user.name ?? user.email ?? user.id),
  };
}

/**
 * The IT service desk's own endpoints.
 *
 * `tickets` is a business resource, not a table: every route here resolves one composite action through the request's
 * authorization context, and the service binds the policy that decision returned. Mounting under `/api` authenticates
 * nothing, so this router installs both the session and the authorization middleware on the paths it owns, and nothing
 * else.
 */
export const ticketApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const scoped = new Hono<TicketEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const tickets = app.container.resolve(ticketServiceToken);

    // An isolated sub-router mounted at `/tickets`: `use('*')` here reaches only this feature's paths, so it cannot
    // leak onto a contribution mounted later.
    scoped.use('*', auth.required(), authorization.middleware());

    scoped.get(
      '/',
      describeRoute({
        tags: ['Tickets'],
        summary: 'List the tickets the caller may see',
        operationId: 'listTickets',
        responses: {
          '200': listResponse(Ticket, TicketPageMeta, 'One page of tickets.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListTicketsQuery),
      async (context) => {
        const query = context.req.valid('query');
        const result = await tickets.list(
          context.get('authz'),
          actorOf(context),
          {
            status: query.status,
            urgency: query.urgency,
            assigneeId: query.assigneeId,
            keyword: query.q,
            overdue: query.overdue !== undefined,
            page: query.page,
            pageSize: query.pageSize,
          },
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

    scoped.post(
      '/',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Report a repair request',
        operationId: 'createTicket',
        responses: {
          '201': dataResponse(
            TicketDetail,
            'The reported ticket, in its initial state.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateTicketInput),
      async (context) => {
        const input = context.req.valid('json');
        const result = await tickets.create(
          context.get('authz'),
          actorOf(context),
          input,
        );
        return context.json({ data: result }, 201);
      },
    );

    // Fixed segments come before `/:ticketId`: Hono matches in registration order and the first match wins.
    scoped.get(
      '/dashboard',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Read the service desk dashboard',
        operationId: 'getTicketDashboard',
        responses: {
          '200': dataResponse(
            TicketDashboard,
            'Counts, per-engineer workload and the latest tickets.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) =>
        context.json({
          data: await tickets.dashboard(context.get('authz'), actorOf(context)),
        }),
    );

    scoped.get(
      '/assignableUsers',
      describeRoute({
        tags: ['Tickets'],
        summary: 'List the engineers a ticket can be assigned to',
        operationId: 'listTicketAssignees',
        responses: {
          '200': listResponse(
            TicketAssignee,
            undefined,
            'The engineers holding the engineer permission set.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const assignees = await tickets.assignableUsers();
        return context.json({
          data: assignees,
          meta: { total: assignees.length },
        });
      },
    );

    scoped.get(
      '/lifecycle',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Read the repair-handling lifecycle definition',
        operationId: 'getTicketLifecycle',
        responses: {
          '200': dataResponse(
            z.object({
              definition: TicketDefinition,
              description: TicketLifecycleDescription,
            }),
            'The states, transitions and read-only parameters the management page draws.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        // Resolving the composite action once proves the caller may see the process administration at all.
        await tickets.executions(context.get('authz'), { pageSize: 1 });
        return context.json({
          data: {
            definition: tickets.definition(),
            description: tickets.description(),
          },
        });
      },
    );

    scoped.get(
      '/executions',
      describeRoute({
        tags: ['Tickets'],
        summary: 'List recorded ticket transitions and their effect runs',
        operationId: 'listTicketExecutions',
        responses: {
          '200': dataResponse(
            TicketExecutions,
            'One page of transitions with the effect runs they queued.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListExecutionsQuery),
      async (context) => {
        const query = context.req.valid('query');
        const result = await tickets.executions(context.get('authz'), {
          page: query.page,
          pageSize: query.pageSize,
          recordId: query.ticketId,
        });
        return context.json({
          data: result,
          meta: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
          },
        });
      },
    );

    scoped.get(
      '/:ticketId',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Read one ticket',
        operationId: 'getTicket',
        responses: {
          '200': dataResponse(
            TicketDetail,
            'The ticket, its available transitions, history and comments.',
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(
            404,
            'No such ticket is visible to the caller.',
          ),
        },
      }),
      apiValidator('param', TicketParams),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        return context.json({
          data: await tickets.detail(
            context.get('authz'),
            actorOf(context),
            ticketId,
          ),
        });
      },
    );

    scoped.post(
      '/:ticketId/comments',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Add a comment to a ticket',
        operationId: 'createTicketComment',
        responses: {
          '201': dataResponse(TicketComment, 'The stored comment.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(
            404,
            'No such ticket is visible to the caller.',
          ),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', CreateTicketCommentInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { body } = context.req.valid('json');
        return context.json(
          {
            data: await tickets.comment(
              context.get('authz'),
              actorOf(context),
              ticketId,
              body,
            ),
          },
          201,
        );
      },
    );

    scoped.post(
      '/:ticketId/transitions/:transition',
      describeRoute({
        tags: ['Tickets'],
        summary: 'Move a ticket through one of its lifecycle transitions',
        operationId: 'fireTicketTransition',
        responses: {
          '200': dataResponse(TicketDetail, 'The ticket after the transition.'),
          ...apiErrorResponses,
          '400': apiErrorResponse(
            400,
            "The transition is not available from the ticket's state, a field it needs is missing (`FAILED_PRECONDITION`), or the transition needs an input the request does not carry (`INVALID_ARGUMENT`).",
          ),
          '404': apiErrorResponse(
            404,
            'No such ticket is visible to the caller.',
          ),
          '409': apiErrorResponse(
            409,
            'The ticket changed since the caller read it (`CONFLICT`), or the request id was already used for a different transition (`REQUEST_REUSED`).',
          ),
        },
      }),
      apiValidator('param', TicketTransitionParams),
      apiValidator('json', FireTicketTransitionInput),
      async (context) => {
        const { ticketId, transition } = context.req.valid('param');
        const body = context.req.valid('json');
        const { version, requestId, ...input } = body;
        return context.json({
          data: await tickets.fire(
            context.get('authz'),
            actorOf(context),
            ticketId,
            transition,
            input,
            {
              ...(version !== undefined ? { version } : {}),
              ...(requestId ? { requestId } : {}),
            },
          ),
        });
      },
    );

    router.route('/tickets', scoped);
    return router;
  });

export default ticketApiRoutes;
