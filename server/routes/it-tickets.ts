import {
  authenticationToken,
  type AuthEnv,
  type AuthSession,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
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
import type { AuthorizationEnv } from '@nocobase/authorization/core';
import { Hono } from 'hono';

import {
  ItTicketNotFoundError,
  ItTicketStateError,
  itTicketsServiceToken,
  type ItTicketActor,
} from '../it-tickets/service.js';
import {
  CompleteItTicketInput,
  CreateItTicketInput,
  ItTicketPageMeta,
  ItTicketParams,
  ItTicketSchema,
  ListItTicketsQuery,
} from './schemas.js';

const tags = ['IT repair tickets'];

/** The API's own reason namespace, used by the errors this feature raises itself. */
const domain = 'itTickets';

/** The context variables the two middlewares this router installs provide. */
type ItTicketsRouteEnv = AuthEnv & AuthorizationEnv;

/** The session `authentication.required()` guarantees; it is what an action is recorded against. */
function actorOf(auth: AuthSession | null): ItTicketActor {
  const user = auth?.user;
  return {
    id: String(user?.id ?? ''),
    name: String(user?.name || user?.email || ''),
  };
}

/**
 * The ticket endpoints.
 *
 * Each one authorizes a composite action and lets the service run every query
 * under the Repository Policy that action resolves to, so an employee reading
 * the list and an employee reading one ticket by id are narrowed by the same
 * stored rule. The domain errors the service raises are translated here; a
 * refusal by the authorization framework is already a recognized error and
 * passes through unchanged.
 *
 * The router is returned as the framework's default `Hono`, and the endpoints
 * live on an isolated sub-router mounted at `/itTickets`: the two middlewares
 * are installed once, on that sub-router's `*`, so they cover every path this
 * feature owns and nothing else. Installing them on the returned router's `*`
 * would also cover every `/api` path a contribution mounted after this one
 * answers, turning an unregistered path into `401` instead of `404`.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const routes = new Hono<ItTicketsRouteEnv>();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const tickets = app.container.resolve(itTicketsServiceToken);

    routes.onError((error, context) =>
      apiErrorHandler(toItTicketsApiError(error) ?? error, context),
    );
    routes.use('*', authentication.required(), authorization.middleware());

    routes.get(
      '/',
      describeRoute({
        tags,
        summary: 'List the IT repair tickets the caller may see',
        operationId: 'itTicketsListItTickets',
        description:
          'An employee sees only the tickets they submitted; a handler sees every ticket. `status` filters by the workflow state.',
        responses: {
          200: listResponse(ItTicketSchema, ItTicketPageMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListItTicketsQuery),
      async (context) => {
        const query = context.req.valid('query');
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const result = await tickets.list(context.get('authz'), {
          status: query.status,
          page,
          pageSize,
        });
        return context.json({
          data: result.items,
          meta: { page, pageSize, total: result.total },
        });
      },
    );

    routes.get(
      '/:ticketId',
      describeRoute({
        tags,
        summary: 'Get one IT repair ticket',
        operationId: 'itTicketsGetItTicket',
        description:
          'A ticket the caller may not see is answered exactly like one that does not exist, so the endpoint cannot be used to confirm that a ticket the caller may not see exists.',
        responses: {
          200: dataResponse(ItTicketSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ItTicketParams),
      async (context) =>
        context.json({
          data: await tickets.get(
            context.get('authz'),
            context.req.valid('param').ticketId,
          ),
        }),
    );

    routes.post(
      '/',
      describeRoute({
        tags,
        summary: 'Submit an IT repair ticket',
        operationId: 'itTicketsCreateItTicket',
        description:
          'The submitter is taken from the session, never from the request body. A new ticket starts as `pending`.',
        responses: {
          201: dataResponse(ItTicketSchema, 'The created ticket.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateItTicketInput),
      async (context) => {
        const ticket = await tickets.create(
          context.get('authz'),
          context.req.valid('json'),
          actorOf(context.get('auth')),
        );
        return context.json({ data: ticket }, 201);
      },
    );

    routes.post(
      '/:ticketId/start',
      describeRoute({
        tags,
        summary: 'Start handling an IT repair ticket',
        operationId: 'itTicketsStartItTicket',
        description:
          'Moves a `pending` ticket to `processing` and records the handler from the session. Only a handler may do this.',
        responses: {
          200: dataResponse(ItTicketSchema),
          ...apiErrorResponses,
          400: apiErrorResponse(
            400,
            'The ticket is no longer `pending` (`IT_TICKET_NOT_PENDING`).',
          ),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ItTicketParams),
      async (context) =>
        context.json({
          data: await tickets.start(
            context.get('authz'),
            context.req.valid('param').ticketId,
            actorOf(context.get('auth')),
          ),
        }),
    );

    routes.post(
      '/:ticketId/complete',
      describeRoute({
        tags,
        summary: 'Complete an IT repair ticket',
        operationId: 'itTicketsCompleteItTicket',
        description:
          'Moves a `processing` ticket to `completed`. A resolution note is required, and a completed ticket is never changed again. Only a handler may do this.',
        responses: {
          200: dataResponse(ItTicketSchema),
          ...apiErrorResponses,
          400: apiErrorResponse(
            400,
            'The ticket is already `completed` (`IT_TICKET_ALREADY_COMPLETED`), is not `processing` (`IT_TICKET_NOT_PROCESSING`), or the resolution note is empty (`IT_TICKET_RESOLUTION_REQUIRED`).',
          ),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ItTicketParams),
      apiValidator('json', CompleteItTicketInput),
      async (context) =>
        context.json({
          data: await tickets.complete(
            context.get('authz'),
            context.req.valid('param').ticketId,
            context.req.valid('json').resolutionNote,
          ),
        }),
    );

    router.route('/itTickets', routes);
    return router;
  },
);

/**
 * The two domain failures the service raises, as the standard error body. A
 * refused transition is reported as `FAILED_PRECONDITION` with the service's
 * own code as `reason`, so the client can pick its wording from the locale
 * files instead of showing an English sentence.
 */
function toItTicketsApiError(error: unknown): ApiError | undefined {
  if (error instanceof ItTicketNotFoundError) {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'IT_TICKET_NOT_FOUND',
      domain,
      message: error.message,
    });
  }
  if (error instanceof ItTicketStateError) {
    return new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: error.code,
      domain,
      message: error.message,
    });
  }
  return undefined;
}
