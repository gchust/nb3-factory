import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type {
  AuthEnv,
  AuthSession,
} from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization/server';
import { lifecycleErrorFields } from '@nocobase/lifecycle';
import type { LifecycleError } from '@nocobase/lifecycle';
import { Hono } from 'hono';
import type { Context } from 'hono';

import {
  helpdeskServiceToken,
  type ActorContext,
} from '../helpdesk/service.js';
import {
  commentTicketBodySchema,
  createTicketBodySchema,
  engineerSchema,
  fireTicketBodySchema,
  listTicketsQuerySchema,
  overviewSchema,
  ticketCommentSchema,
  ticketDetailSchema,
  ticketParamsSchema,
  ticketSchema,
} from './schemas.js';

/** The environment every help-desk request runs in: a resolved session and an authorization context. */
type HelpdeskEnv = AuthEnv & AuthorizationEnv;

const HELP_DESK_DOMAIN = 'helpdesk';

function actorContext(context: Context): ActorContext {
  const typed = context as unknown as Context<HelpdeskEnv>;
  const auth = typed.get('auth');
  const authz = typed.get('authz');
  if (!auth) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTH_REQUIRED',
      domain: HELP_DESK_DOMAIN,
      message: 'This endpoint requires a signed-in session.',
    });
  }
  if (!authz) {
    throw new ApiError({
      status: 'INTERNAL',
      reason: 'AUTHORIZATION_CONTEXT_MISSING',
      domain: HELP_DESK_DOMAIN,
      message: 'The authorization middleware did not run for this request.',
    });
  }
  const user = auth.user;
  return {
    actor: { id: user.id },
    name: user.name || user.email || user.id,
    authz,
  };
}

function notFound(id: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'TICKET_NOT_FOUND',
    domain: HELP_DESK_DOMAIN,
    message: `No ticket with id ${id} is visible to you.`,
  });
}

/** Translate a lifecycle refusal into the standard error body, or rethrow anything else. */
function rethrowLifecycle(error: unknown): never {
  const fields = lifecycleErrorFields(error as LifecycleError, {
    inputField: 'input',
  });
  if (!fields) throw error;
  throw new ApiError({ ...fields, domain: HELP_DESK_DOMAIN });
}

export const helpdeskRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    // The authorization, authentication and help-desk services are built-ins of the real application. A runtime
    // composed without them (a host or a test) has nothing to serve, so contribute an empty router rather than failing
    // route registration.
    if (
      !app.container.has(authenticationToken) ||
      !app.container.has(authorizationToken) ||
      !app.container.has(helpdeskServiceToken)
    ) {
      return router;
    }
    const auth = app.container.resolve(authenticationToken);
    const authorize = app.container.resolve(authorizationToken);
    const service = () => app.container.resolve(helpdeskServiceToken);

    router.get(
      '/tickets',
      describeRoute({
        tags: ['HelpDesk'],
        summary: 'List the tickets the caller may see',
        operationId: 'listTickets',
        responses: {
          200: listResponse(ticketSchema, undefined, 'The visible tickets.'),
          401: apiErrorResponse(401),
          403: apiErrorResponse(403),
          500: apiErrorResponse(500),
        },
      }),
      auth.required(),
      authorize.middleware(),
      apiValidator('query', listTicketsQuerySchema),
      async (context) => {
        const query = context.req.valid('query');
        const result = await service().list(actorContext(context), query);
        return context.json({
          data: result.rows,
          meta: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
          },
        });
      },
    );

    router.get(
      '/tickets/:id',
      describeRoute({
        tags: ['HelpDesk'],
        summary: 'Read one ticket with its comments and offered transitions',
        operationId: 'getTicket',
        responses: {
          200: dataResponse(ticketDetailSchema, 'The ticket.'),
          401: apiErrorResponse(401),
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
          500: apiErrorResponse(500),
        },
      }),
      auth.required(),
      authorize.middleware(),
      apiValidator('param', ticketParamsSchema),
      async (context) => {
        const { id } = context.req.valid('param');
        const detail = await service().detail(actorContext(context), id);
        if (!detail) throw notFound(id);
        return context.json({ data: detail });
      },
    );

    router.post(
      '/tickets',
      describeRoute({
        tags: ['HelpDesk'],
        summary: 'Submit a ticket',
        operationId: 'createTicket',
        responses: {
          201: dataResponse(ticketSchema, 'The created ticket.'),
          401: apiErrorResponse(401),
          403: apiErrorResponse(403),
          500: apiErrorResponse(500),
        },
      }),
      auth.required(),
      authorize.middleware(),
      apiValidator('json', createTicketBodySchema),
      async (context) => {
        const body = context.req.valid('json');
        const ticket = await service().create(actorContext(context), {
          ...body,
          category: body.category ?? null,
        });
        return context.json({ data: ticket }, 201);
      },
    );

    router.post(
      '/tickets/:id/fire',
      describeRoute({
        tags: ['HelpDesk'],
        summary: 'Take a lifecycle transition on a ticket',
        operationId: 'fireTicketTransition',
        responses: {
          200: dataResponse(ticketSchema, 'The ticket after the transition.'),
          400: apiErrorResponse(400),
          401: apiErrorResponse(401),
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
          409: apiErrorResponse(409),
          500: apiErrorResponse(500),
        },
      }),
      auth.required(),
      authorize.middleware(),
      apiValidator('param', ticketParamsSchema),
      apiValidator('json', fireTicketBodySchema),
      async (context) => {
        const { id } = context.req.valid('param');
        const body = context.req.valid('json');
        try {
          const ticket = await service().fire(actorContext(context), id, {
            transition: body.transition,
            input: body.input ?? {},
            version: body.version,
          });
          if (!ticket) throw notFound(id);
          return context.json({ data: ticket });
        } catch (error) {
          rethrowLifecycle(error);
        }
      },
    );

    router.post(
      '/tickets/:id/comments',
      describeRoute({
        tags: ['HelpDesk'],
        summary: 'Add a comment to a ticket',
        operationId: 'commentTicket',
        responses: {
          201: dataResponse(ticketCommentSchema, 'The created comment.'),
          401: apiErrorResponse(401),
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
          500: apiErrorResponse(500),
        },
      }),
      auth.required(),
      authorize.middleware(),
      apiValidator('param', ticketParamsSchema),
      apiValidator('json', commentTicketBodySchema),
      async (context) => {
        const { id } = context.req.valid('param');
        const body = context.req.valid('json');
        const comment = await service().comment(actorContext(context), id, {
          body: body.body,
          kind: body.kind,
        });
        if (!comment) throw notFound(id);
        return context.json({ data: comment }, 201);
      },
    );

    router.get(
      '/helpdesk/overview',
      describeRoute({
        tags: ['HelpDesk'],
        summary:
          'The caller’s dashboard: role, counts, workload and recent tickets',
        operationId: 'getHelpdeskOverview',
        responses: {
          200: dataResponse(overviewSchema, 'The overview.'),
          401: apiErrorResponse(401),
          403: apiErrorResponse(403),
          500: apiErrorResponse(500),
        },
      }),
      auth.required(),
      authorize.middleware(),
      async (context) =>
        context.json({ data: await service().overview(actorContext(context)) }),
    );

    router.get(
      '/helpdesk/engineers',
      describeRoute({
        tags: ['HelpDesk'],
        summary: 'List the engineers a ticket may be assigned to',
        operationId: 'listHelpdeskEngineers',
        responses: {
          200: listResponse(engineerSchema, undefined, 'The engineers.'),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      auth.required(),
      authorize.middleware(),
      async (context) => context.json({ data: await service().engineers() }),
    );

    return router;
  });

/** The session this route's own handlers read, exported for tests that build a request by hand. */
export type HelpdeskSession = AuthSession;

export default helpdeskRoutes;
