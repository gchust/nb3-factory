import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
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
import { Hono, type Context } from 'hono';

import { HelpdeskConflict, HelpdeskForbidden } from '../helpdesk/service.js';
import type { HelpdeskViewer } from '../helpdesk/roles.js';
import { helpdeskServiceToken } from '../helpdesk/tokens.js';
import {
  assignTicketBodySchema,
  contentBodySchema,
  createTicketBodySchema,
  engineerSchema,
  listTicketsQuerySchema,
  resolveTicketBodySchema,
  statsSchema,
  ticketIdParamSchema,
  ticketSchema,
  viewerSchema,
} from './schemas.js';

const tag = 'Helpdesk';

/** Map a refused ticket transition to the standard API error the client branches on. */
function transitionError(error: unknown): never {
  if (error instanceof HelpdeskForbidden) {
    throw new ApiError({
      status: 'PERMISSION_DENIED',
      reason: 'HELPDESK_FORBIDDEN',
      domain: 'helpdesk',
      message: error.message,
    });
  }
  if (error instanceof HelpdeskConflict) {
    throw new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: 'HELPDESK_CONFLICT',
      domain: 'helpdesk',
      message: error.message,
    });
  }
  throw error;
}

function notFound(): never {
  throw new ApiError({
    status: 'NOT_FOUND',
    reason: 'HELPDESK_TICKET_NOT_FOUND',
    domain: 'helpdesk',
    message: 'The ticket does not exist or is not visible to this user.',
  });
}

export const helpdeskApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(helpdeskServiceToken);
    const router = new Hono();

    async function viewerFor(
      context: Context<AuthEnv>,
    ): Promise<HelpdeskViewer> {
      const authValue = context.get('auth');
      const user = authValue!.user;
      const role = await service.roleOf(user.id);
      return {
        userId: user.id,
        name: user.name ?? user.email ?? user.id,
        email: user.email,
        role,
      };
    }

    const helpdesk = new Hono<AuthEnv>();
    helpdesk.use('*', auth.required());

    helpdesk.get(
      '/me',
      describeRoute({
        tags: [tag],
        summary: 'Read the current helpdesk identity and role',
        operationId: 'helpdeskGetMe',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(viewerSchema),
        },
      }),
      async (context) => context.json({ data: await viewerFor(context) }),
    );

    helpdesk.get(
      '/engineers',
      describeRoute({
        tags: [tag],
        summary: 'List engineers available for assignment',
        operationId: 'helpdeskListEngineers',
        responses: {
          ...apiErrorResponses,
          '200': listResponse(engineerSchema),
        },
      }),
      async (context) => {
        const engineers = await service.listAssignableEngineers();
        return context.json({
          data: engineers,
          meta: { total: engineers.length },
        });
      },
    );

    helpdesk.get(
      '/stats',
      describeRoute({
        tags: [tag],
        summary: 'Read dashboard statistics for the current user',
        operationId: 'helpdeskGetStats',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(statsSchema),
        },
      }),
      async (context) =>
        context.json({ data: await service.stats(await viewerFor(context)) }),
    );

    helpdesk.get(
      '/tickets',
      describeRoute({
        tags: [tag],
        summary: 'List tickets visible to the current user',
        operationId: 'helpdeskListTickets',
        responses: {
          ...apiErrorResponses,
          '200': listResponse(ticketSchema),
        },
      }),
      apiValidator('query', listTicketsQuerySchema),
      async (context) => {
        const viewer = await viewerFor(context);
        const query = context.req.valid('query');
        const { data, total } = await service.listTickets(viewer, query);
        return context.json({
          data,
          meta: {
            total,
            page: query.page ?? 1,
            pageSize: query.pageSize ?? 20,
          },
        });
      },
    );

    helpdesk.post(
      '/tickets',
      describeRoute({
        tags: [tag],
        summary: 'Submit a new repair ticket',
        operationId: 'helpdeskCreateTicket',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(ticketSchema),
        },
      }),
      apiValidator('json', createTicketBodySchema),
      async (context) => {
        const viewer = await viewerFor(context);
        const ticket = await service.createTicket(
          viewer,
          context.req.valid('json'),
        );
        return context.json({ data: ticket });
      },
    );

    helpdesk.get(
      '/tickets/:ticketId',
      describeRoute({
        tags: [tag],
        summary: 'Read one ticket and its handling history',
        operationId: 'helpdeskGetTicket',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(ticketSchema),
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ticketIdParamSchema),
      async (context) => {
        const viewer = await viewerFor(context);
        const { ticketId } = context.req.valid('param');
        const ticket = await service.getTicket(viewer, ticketId);
        if (!ticket) notFound();
        return context.json({ data: ticket });
      },
    );

    helpdesk.post(
      '/tickets/:ticketId/assign',
      describeRoute({
        tags: [tag],
        summary: 'Dispatch a ticket to an engineer',
        operationId: 'helpdeskAssignTicket',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(ticketSchema),
          '404': apiErrorResponse(404),
          '400': apiErrorResponse(
            400,
            'When the ticket is not in a state that allows dispatch',
          ),
        },
      }),
      apiValidator('param', ticketIdParamSchema),
      apiValidator('json', assignTicketBodySchema),
      async (context) => {
        const viewer = await viewerFor(context);
        const { ticketId } = context.req.valid('param');
        const { assigneeId } = context.req.valid('json');
        try {
          const ticket = await service.assignTicket(
            viewer,
            ticketId,
            assigneeId,
          );
          if (!ticket) notFound();
          return context.json({ data: ticket });
        } catch (error) {
          return transitionError(error);
        }
      },
    );

    helpdesk.post(
      '/tickets/:ticketId/process',
      describeRoute({
        tags: [tag],
        summary: 'Record handling progress on a ticket',
        operationId: 'helpdeskProcessTicket',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(ticketSchema),
          '404': apiErrorResponse(404),
          '400': apiErrorResponse(
            400,
            'When the ticket is not in a state that allows handling',
          ),
        },
      }),
      apiValidator('param', ticketIdParamSchema),
      apiValidator('json', contentBodySchema),
      async (context) => {
        const viewer = await viewerFor(context);
        const { ticketId } = context.req.valid('param');
        const { content } = context.req.valid('json');
        try {
          const ticket = await service.processTicket(viewer, ticketId, content);
          if (!ticket) notFound();
          return context.json({ data: ticket });
        } catch (error) {
          return transitionError(error);
        }
      },
    );

    helpdesk.post(
      '/tickets/:ticketId/resolve',
      describeRoute({
        tags: [tag],
        summary: 'Record the solution and mark a ticket resolved',
        operationId: 'helpdeskResolveTicket',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(ticketSchema),
          '404': apiErrorResponse(404),
          '400': apiErrorResponse(
            400,
            'When the ticket is not in a state that allows resolution',
          ),
        },
      }),
      apiValidator('param', ticketIdParamSchema),
      apiValidator('json', resolveTicketBodySchema),
      async (context) => {
        const viewer = await viewerFor(context);
        const { ticketId } = context.req.valid('param');
        const { solution } = context.req.valid('json');
        try {
          const ticket = await service.resolveTicket(
            viewer,
            ticketId,
            solution,
          );
          if (!ticket) notFound();
          return context.json({ data: ticket });
        } catch (error) {
          return transitionError(error);
        }
      },
    );

    helpdesk.post(
      '/tickets/:ticketId/confirm',
      describeRoute({
        tags: [tag],
        summary: 'Confirm a resolved ticket and close it',
        operationId: 'helpdeskConfirmTicket',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(ticketSchema),
          '404': apiErrorResponse(404),
          '400': apiErrorResponse(
            400,
            'When the ticket is not in a state that allows confirmation',
          ),
        },
      }),
      apiValidator('param', ticketIdParamSchema),
      async (context) => {
        const viewer = await viewerFor(context);
        const { ticketId } = context.req.valid('param');
        try {
          const ticket = await service.confirmTicket(viewer, ticketId);
          if (!ticket) notFound();
          return context.json({ data: ticket });
        } catch (error) {
          return transitionError(error);
        }
      },
    );

    helpdesk.post(
      '/tickets/:ticketId/reject',
      describeRoute({
        tags: [tag],
        summary: 'Return a resolved ticket for further handling',
        operationId: 'helpdeskRejectTicket',
        responses: {
          ...apiErrorResponses,
          '200': dataResponse(ticketSchema),
          '404': apiErrorResponse(404),
          '400': apiErrorResponse(
            400,
            'When the ticket is not in a state that allows sending it back',
          ),
        },
      }),
      apiValidator('param', ticketIdParamSchema),
      apiValidator('json', contentBodySchema),
      async (context) => {
        const viewer = await viewerFor(context);
        const { ticketId } = context.req.valid('param');
        const { content } = context.req.valid('json');
        try {
          const ticket = await service.rejectTicket(viewer, ticketId, content);
          if (!ticket) notFound();
          return context.json({ data: ticket });
        } catch (error) {
          return transitionError(error);
        }
      },
    );

    router.route('/helpdesk', helpdesk);
    return router;
  });
