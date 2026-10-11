import { Hono, type Context } from 'hono';

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
  itTicketServiceToken,
  ItTicketError,
  type ItTicketService,
  type TicketPrincipal,
} from '../providers/it-tickets/index.js';
import {
  AssignTicketInput,
  CloseTicketInput,
  CommentTicketInput,
  CreateTicketInput,
  DashboardSchema,
  ItRoleSchema,
  ItUserSchema,
  ProcessTicketInput,
  ResolveTicketInput,
  ReturnTicketInput,
  TeamMemberParams,
  TicketListMetaSchema,
  TicketListQuery,
  TicketParams,
  TicketSchema,
  UpdateTeamMemberInput,
} from './schemas.js';

const DOMAIN = 'itTickets';
const TAGS = ['IT Tickets'];

/** A ticket operation the caller may not perform is a 403 the service raised, not the framework. */
const TICKET_ERRORS = {
  ...apiErrorResponses,
  400: apiErrorResponse(
    400,
    'The ticket is not in a state that allows this operation, or a value is invalid.',
  ),
  404: apiErrorResponse(
    404,
    'The ticket does not exist, or the caller may not see it.',
  ),
} as const;

/**
 * Translate the service's HTTP-free error into the standard API error body. The service owns the status and reason;
 * this is the only place that knows how they map onto `ApiError`.
 */
function toApiError(error: ItTicketError): ApiError {
  const status: ApiError['status'] =
    error.status === 400
      ? 'INVALID_ARGUMENT'
      : error.status === 401
        ? 'UNAUTHENTICATED'
        : error.status === 403
          ? 'PERMISSION_DENIED'
          : error.status === 404
            ? 'NOT_FOUND'
            : error.status === 409
              ? 'FAILED_PRECONDITION'
              : 'INTERNAL';
  return new ApiError({
    status,
    reason: error.reason,
    domain: DOMAIN,
    message: error.message,
  });
}

/** `auth.required()` guarantees a session; the narrowing is what the service needs. */
function principalOf(context: Context): TicketPrincipal {
  const session = (context as unknown as Context<AuthEnv>).get('auth');
  if (!session) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'IT_TICKET_UNAUTHENTICATED',
      domain: DOMAIN,
      message: 'A session is required.',
    });
  }
  return { userId: session.user.id };
}

export const itTicketApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const tickets =
      app.container.resolve<ItTicketService>(itTicketServiceToken);

    router.onError((error, context) =>
      apiErrorHandler(
        error instanceof ItTicketError ? toApiError(error) : error,
        context,
      ),
    );

    // Authentication is installed on each path this contribution owns, never on `*`: the shared `/api` router merges
    // every contribution, and a wildcard here would also guard routes registered after it.
    const secure = (path: string): void => {
      router.use(path, auth.required());
    };

    secure('/itMe');
    router.get(
      '/itMe',
      describeRoute({
        tags: TAGS,
        summary: "The caller's IT role",
        operationId: 'getItMe',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(ItRoleSchema),
        },
      }),
      async (context) =>
        context.json({ data: await tickets.roleOf(principalOf(context)) }),
    );

    secure('/itDashboard');
    router.get(
      '/itDashboard',
      describeRoute({
        tags: TAGS,
        summary: 'Ticket counts and engineer workload',
        operationId: 'getItDashboard',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(DashboardSchema),
        },
      }),
      async (context) =>
        context.json({
          data: await tickets.dashboard(principalOf(context)),
        }),
    );

    secure('/itTickets');
    router.get(
      '/itTickets',
      describeRoute({
        tags: TAGS,
        summary: 'List the tickets the caller may see',
        operationId: 'listItTickets',
        responses: {
          ...apiErrorResponses,
          '200': listResponse(TicketSchema, TicketListMetaSchema),
        },
      }),
      apiValidator('query', TicketListQuery),
      async (context) => {
        const query = context.req.valid('query');
        const result = await tickets.list(principalOf(context), query);
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

    router.post(
      '/itTickets',
      describeRoute({
        tags: TAGS,
        summary: 'Report an issue',
        operationId: 'createItTicket',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(TicketSchema, 'The ticket that was created.'),
          '400': apiErrorResponse(400, 'An attachment does not exist.'),
        },
      }),
      apiValidator('json', CreateTicketInput),
      async (context) =>
        context.json({
          data: await tickets.create(
            principalOf(context),
            context.req.valid('json'),
          ),
        }),
    );

    secure('/itTickets/:ticketId');
    router.get(
      '/itTickets/:ticketId',
      describeRoute({
        tags: TAGS,
        summary: 'Read one ticket with its history and attachments',
        operationId: 'getItTicket',
        responses: {
          ...TICKET_ERRORS,
          '200': dataResponse(TicketSchema),
        },
      }),
      apiValidator('param', TicketParams),
      async (context) =>
        context.json({
          data: await tickets.get(
            principalOf(context),
            context.req.valid('param').ticketId,
          ),
        }),
    );

    for (const action of [
      'assign',
      'process',
      'resolve',
      'return',
      'close',
      'comment',
    ] as const) {
      secure(`/itTickets/:ticketId/${action}`);
    }

    router.post(
      '/itTickets/:ticketId/assign',
      describeRoute({
        tags: TAGS,
        summary: 'Assign a ticket to an engineer',
        operationId: 'assignItTicket',
        responses: {
          ...TICKET_ERRORS,
          '200': dataResponse(TicketSchema),
          '400': apiErrorResponse(400, 'The assignee is not a user.'),
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', AssignTicketInput),
      async (context) =>
        context.json({
          data: await tickets.assign(
            principalOf(context),
            context.req.valid('param').ticketId,
            context.req.valid('json').assigneeId,
          ),
        }),
    );

    router.post(
      '/itTickets/:ticketId/process',
      describeRoute({
        tags: TAGS,
        summary: 'Record processing progress',
        operationId: 'processItTicket',
        responses: { ...TICKET_ERRORS, '200': dataResponse(TicketSchema) },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', ProcessTicketInput),
      async (context) =>
        context.json({
          data: await tickets.process(
            principalOf(context),
            context.req.valid('param').ticketId,
            context.req.valid('json').content,
          ),
        }),
    );

    router.post(
      '/itTickets/:ticketId/resolve',
      describeRoute({
        tags: TAGS,
        summary: 'Mark a ticket resolved for confirmation',
        operationId: 'resolveItTicket',
        responses: { ...TICKET_ERRORS, '200': dataResponse(TicketSchema) },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', ResolveTicketInput),
      async (context) =>
        context.json({
          data: await tickets.resolve(
            principalOf(context),
            context.req.valid('param').ticketId,
            context.req.valid('json').resolution,
          ),
        }),
    );

    router.post(
      '/itTickets/:ticketId/return',
      describeRoute({
        tags: TAGS,
        summary: 'Return a resolved ticket for more work',
        operationId: 'returnItTicket',
        responses: { ...TICKET_ERRORS, '200': dataResponse(TicketSchema) },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', ReturnTicketInput),
      async (context) =>
        context.json({
          data: await tickets.returnForRework(
            principalOf(context),
            context.req.valid('param').ticketId,
            context.req.valid('json').reason,
          ),
        }),
    );

    router.post(
      '/itTickets/:ticketId/close',
      describeRoute({
        tags: TAGS,
        summary: 'Confirm and close a resolved ticket',
        operationId: 'closeItTicket',
        responses: { ...TICKET_ERRORS, '200': dataResponse(TicketSchema) },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', CloseTicketInput),
      async (context) => {
        const body = context.req.valid('json');
        return context.json({
          data: await tickets.close(
            principalOf(context),
            context.req.valid('param').ticketId,
            body.comment,
          ),
        });
      },
    );

    router.post(
      '/itTickets/:ticketId/comment',
      describeRoute({
        tags: TAGS,
        summary: 'Add a comment to a ticket',
        operationId: 'commentItTicket',
        responses: { ...TICKET_ERRORS, '200': dataResponse(TicketSchema) },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', CommentTicketInput),
      async (context) =>
        context.json({
          data: await tickets.comment(
            principalOf(context),
            context.req.valid('param').ticketId,
            context.req.valid('json').content,
          ),
        }),
    );

    secure('/itUsers');
    router.get(
      '/itUsers',
      describeRoute({
        tags: TAGS,
        summary: 'List users and their IT roles',
        operationId: 'listItUsers',
        responses: { ...apiErrorResponses, '200': listResponse(ItUserSchema) },
      }),
      async (context) => {
        const users = await tickets.listUsers(principalOf(context));
        return context.json({
          data: users,
          meta: { total: users.length, page: 1, pageSize: users.length },
        });
      },
    );

    secure('/itTeamMembers/:userId');
    router.put(
      '/itTeamMembers/:userId',
      describeRoute({
        tags: TAGS,
        summary: "Set a user's IT role",
        operationId: 'updateItTeamMember',
        responses: {
          ...apiErrorResponses,
          '200': listResponse(ItUserSchema, TicketListMetaSchema),
          '400': apiErrorResponse(400, 'The user does not exist.'),
        },
      }),
      apiValidator('param', TeamMemberParams),
      apiValidator('json', UpdateTeamMemberInput),
      async (context) => {
        const role = context.req.valid('json').role;
        const users = await tickets.setMemberRole(
          principalOf(context),
          context.req.valid('param').userId,
          role === 'none' ? null : role,
        );
        return context.json({
          data: users,
          meta: { total: users.length, page: 1, pageSize: users.length },
        });
      },
    );

    return router;
  });
