import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthSession } from '@nocobase/app-plugin-authentication/server';
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
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { ticketServiceToken, TicketError } from '../itsm/service.js';
import type { TicketActor } from '../itsm/service.js';
import {
  AssignTicketInput,
  CommentTicketInput,
  CreateTicketInput,
  DashboardSchema,
  EngineerSchema,
  ProcessTicketInput,
  ResolveTicketInput,
  ReturnTicketInput,
  TicketDetailSchema,
  TicketListMetaSchema,
  TicketListQuery,
  TicketParams,
  TicketViewSchema,
} from './schemas.js';

/** The context variables the ticket routes rely on (`auth.required()` sets `auth`). */
type TicketEnv = {
  Variables: {
    auth: AuthSession;
  };
};

/** The error responses of the single-ticket actions, which can miss and refuse. */
const ticketErrorResponses = {
  ...apiErrorResponses,
  400: apiErrorResponse(
    400,
    'The ticket is not in a state that allows this step.',
  ),
  404: apiErrorResponse(
    404,
    'No ticket with that id is visible to the caller.',
  ),
};

/** Translates a domain `TicketError` into the standard `/api` error answer. */
function toApiError(error: unknown): unknown {
  if (!(error instanceof TicketError)) {
    return error;
  }
  switch (error.code) {
    case 'TICKET_NOT_FOUND':
      return new ApiError({
        status: 'NOT_FOUND',
        reason: error.code,
        domain: 'itsm',
        message: error.message,
      });
    case 'TICKET_FORBIDDEN':
      return new ApiError({
        status: 'PERMISSION_DENIED',
        reason: error.code,
        domain: 'itsm',
        message: error.message,
      });
    case 'TICKET_INVALID_STATE':
      return new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: error.code,
        domain: 'itsm',
        message: error.message,
      });
    case 'TICKET_INVALID_INPUT':
      return new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: error.code,
        domain: 'itsm',
        message: error.message,
      });
  }
}

export const ticketApiRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  if (!app.container.has(authenticationToken)) {
    return router;
  }
  const auth = app.container.resolve(authenticationToken);
  const tickets = app.container.resolve(ticketServiceToken);

  const routes = new Hono<TicketEnv>();
  routes.onError((error, context) =>
    apiErrorHandler(toApiError(error), context),
  );
  // Scoped to the ticket paths, never `'*'`: the application merges this router into its `/api` router, and a
  // wildcard middleware would then authenticate every contribution mounted after it.
  const required = auth.required() as unknown as MiddlewareHandler<TicketEnv>;
  routes.use('/tickets', required);
  routes.use('/tickets/*', required);

  const actorOf = async (context: Context<TicketEnv>): Promise<TicketActor> => {
    const session = context.get('auth');
    const user = session?.user;
    if (!user) {
      throw new ApiError({
        status: 'UNAUTHENTICATED',
        reason: 'SESSION_REQUIRED',
        domain: 'itsm',
        message: 'A signed-in user is required to work with tickets.',
      });
    }
    const role = await tickets.resolveRole(user.id);
    return {
      id: user.id,
      name: user.name ?? user.email ?? user.id,
      role,
    };
  };

  routes.get(
    '/tickets',
    describeRoute({
      tags: ['Tickets'],
      summary: 'List the tickets the caller may see',
      operationId: 'listTickets',
      responses: {
        '200': listResponse(TicketViewSchema, TicketListMetaSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', TicketListQuery),
    async (context) => {
      const actor = await actorOf(context);
      const result = await tickets.list(actor, context.req.valid('query'));
      return context.json({
        data: result.items,
        meta: { total: result.total },
      });
    },
  );

  routes.post(
    '/tickets',
    describeRoute({
      tags: ['Tickets'],
      summary: 'Submit a service ticket',
      operationId: 'createTicket',
      responses: {
        '201': dataResponse(
          TicketDetailSchema,
          'The ticket that was submitted.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', CreateTicketInput),
    async (context) => {
      const actor = await actorOf(context);
      const created = await tickets.create(actor, context.req.valid('json'));
      return context.json({ data: created }, 201);
    },
  );

  routes.get(
    '/tickets/dashboard',
    describeRoute({
      tags: ['Tickets'],
      summary: 'Summarize the caller\u2019s ticket work',
      operationId: 'getTicketDashboard',
      responses: {
        '200': dataResponse(DashboardSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const actor = await actorOf(context);
      return context.json({ data: await tickets.dashboard(actor) });
    },
  );

  routes.get(
    '/tickets/engineers',
    describeRoute({
      tags: ['Tickets'],
      summary: 'List the engineers a ticket can be assigned to',
      operationId: 'listTicketEngineers',
      responses: {
        '200': listResponse(EngineerSchema, TicketListMetaSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      await actorOf(context);
      const engineers = await tickets.listEngineers();
      return context.json({
        data: engineers,
        meta: { total: engineers.length },
      });
    },
  );

  routes.get(
    '/tickets/:ticketId',
    describeRoute({
      tags: ['Tickets'],
      summary: 'Read one ticket with its process log',
      operationId: 'getTicket',
      responses: {
        '200': dataResponse(TicketDetailSchema),
        ...ticketErrorResponses,
      },
    }),
    apiValidator('param', TicketParams),
    async (context) => {
      const actor = await actorOf(context);
      const { ticketId } = context.req.valid('param');
      return context.json({
        data: await tickets.get(actor, Number(ticketId)),
      });
    },
  );

  routes.post(
    '/tickets/:ticketId/assign',
    describeRoute({
      tags: ['Tickets'],
      summary: 'Assign a ticket to an engineer',
      operationId: 'assignTicket',
      responses: {
        '200': dataResponse(TicketDetailSchema),
        ...ticketErrorResponses,
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', AssignTicketInput),
    async (context) => {
      const actor = await actorOf(context);
      const { ticketId } = context.req.valid('param');
      const { assigneeId } = context.req.valid('json');
      return context.json({
        data: await tickets.assignById(actor, Number(ticketId), assigneeId),
      });
    },
  );

  routes.post(
    '/tickets/:ticketId/process',
    describeRoute({
      tags: ['Tickets'],
      summary: 'Record process on a ticket',
      operationId: 'processTicket',
      responses: {
        '200': dataResponse(TicketDetailSchema),
        ...ticketErrorResponses,
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', ProcessTicketInput),
    async (context) => {
      const actor = await actorOf(context);
      const { ticketId } = context.req.valid('param');
      const { content } = context.req.valid('json');
      return context.json({
        data: await tickets.process(actor, Number(ticketId), content),
      });
    },
  );

  routes.post(
    '/tickets/:ticketId/resolve',
    describeRoute({
      tags: ['Tickets'],
      summary: 'Mark a ticket resolved',
      operationId: 'resolveTicket',
      responses: {
        '200': dataResponse(TicketDetailSchema),
        ...ticketErrorResponses,
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', ResolveTicketInput),
    async (context) => {
      const actor = await actorOf(context);
      const { ticketId } = context.req.valid('param');
      const { resolution } = context.req.valid('json');
      return context.json({
        data: await tickets.resolve(actor, Number(ticketId), resolution),
      });
    },
  );

  routes.post(
    '/tickets/:ticketId/confirm',
    describeRoute({
      tags: ['Tickets'],
      summary: 'Confirm a resolution and close the ticket',
      operationId: 'confirmTicket',
      responses: {
        '200': dataResponse(TicketDetailSchema),
        ...ticketErrorResponses,
      },
    }),
    apiValidator('param', TicketParams),
    async (context) => {
      const actor = await actorOf(context);
      const { ticketId } = context.req.valid('param');
      return context.json({
        data: await tickets.confirm(actor, Number(ticketId)),
      });
    },
  );

  routes.post(
    '/tickets/:ticketId/return',
    describeRoute({
      tags: ['Tickets'],
      summary: 'Return a resolved ticket for more work',
      operationId: 'returnTicket',
      responses: {
        '200': dataResponse(TicketDetailSchema),
        ...ticketErrorResponses,
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', ReturnTicketInput),
    async (context) => {
      const actor = await actorOf(context);
      const { ticketId } = context.req.valid('param');
      const { reason } = context.req.valid('json');
      return context.json({
        data: await tickets.returnTicket(actor, Number(ticketId), reason),
      });
    },
  );

  routes.post(
    '/tickets/:ticketId/comment',
    describeRoute({
      tags: ['Tickets'],
      summary: 'Add a comment to a ticket',
      operationId: 'commentOnTicket',
      responses: {
        '200': dataResponse(TicketDetailSchema),
        ...ticketErrorResponses,
      },
    }),
    apiValidator('param', TicketParams),
    apiValidator('json', CommentTicketInput),
    async (context) => {
      const actor = await actorOf(context);
      const { ticketId } = context.req.valid('param');
      const { content } = context.req.valid('json');
      return context.json({
        data: await tickets.comment(actor, Number(ticketId), content),
      });
    },
  );

  // The inner router owns `/tickets`, and the middleware above is mounted on it, so it scopes to the ticket routes
  // only. A further `/tickets` prefix here would double it.
  router.route('/', routes);
  return router;
});
