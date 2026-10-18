/**
 * `/api/serviceDesk`: the HTTP surface of the service desk. Every route here authenticates first; the record scope
 * and the role checks are the domain logic in `TicketService`, so a route only reads the caller, validates input and
 * hands the work to the service.
 *
 * Every state change goes through `POST /tickets/{ticketId}/fire`; the service passes it to the lifecycle runtime, so
 * a refused transition answers with the standard error body and the guards' blockers in `metadata`. See
 * `server/AGENTS.md` for why the authorization plugin is not the layer enforcing this.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  LifecycleError,
  lifecycleErrorFields,
  type JsonObject,
  type LifecycleActor,
} from '@nocobase/lifecycle';
import {
  TicketNotFoundError,
  ticketServiceToken,
  type TicketService,
} from '../providers/tickets.js';
import {
  AddNoteInput,
  CreateTicketInput,
  DirectoryQuery,
  FireTicketInput,
  ListTicketsQuery,
  MeSchema,
  OverviewSchema,
  ServiceDeskUserSchema,
  SetRoleInput,
  StaffMemberSchema,
  StaffParams,
  TicketListItemSchema,
  TicketListMetaSchema,
  TicketNoteSchema,
  TicketParams,
  TicketViewSchema,
} from './schemas.js';

const domain = 'serviceDesk';
const tags = ['ServiceDesk'];

/** Translate the service's own errors into the standard body; anything else is the application's to answer. */
function toServiceDeskError(error: unknown): unknown {
  if (error instanceof LifecycleError) {
    const fields = lifecycleErrorFields(error, { inputField: 'input' });
    if (fields) return new ApiError({ ...fields, domain });
    return error;
  }
  if (error instanceof TicketNotFoundError) {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'TICKET_NOT_FOUND',
      domain,
      message: 'The ticket does not exist or is not visible to the caller.',
    });
  }
  return error;
}

const unauthorized = {
  401: apiErrorResponse(401),
  500: apiErrorResponse(500),
} as const;

export const apiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono();
    if (!app.container.has(authenticationToken)) return router;

    const authentication = app.container.resolve(authenticationToken);
    const tickets = (): TicketService =>
      app.container.resolve(ticketServiceToken);

    const routes = new Hono();
    routes.onError((error, context) =>
      apiErrorHandler(toServiceDeskError(error), context),
    );
    routes.use('*', authentication.required());

    const actorOf = (context: Context): LifecycleActor => {
      const auth = context.get('auth') as
        { readonly user?: { readonly id?: string } } | undefined;
      return { id: auth?.user?.id ?? '' };
    };

    const requireHelpdesk = async (
      context: Context,
      next: () => Promise<void>,
    ) => {
      const { helpdesk } = await tickets().rolesOf(actorOf(context).id);
      if (!helpdesk) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'HELPDESK_ONLY',
          domain,
          message: 'This action is for the service desk.',
        });
      }
      await next();
    };

    // The caller and their roles: the first call every page makes.
    routes.get(
      '/me',
      describeRoute({
        tags,
        summary: 'Get the signed-in caller and their service desk roles',
        operationId: 'serviceDeskMe',
        responses: {
          200: dataResponse(MeSchema),
          ...unauthorized,
        },
      }),
      async (context) =>
        context.json({ data: await tickets().me(actorOf(context)) }),
    );

    routes.get(
      '/overview',
      describeRoute({
        tags,
        summary: 'Get the service desk dashboard counts',
        operationId: 'serviceDeskOverview',
        description:
          'Counts are scoped to what the caller may see: everything for the service desk, an engineer’s own and assigned tickets, and the caller’s own tickets for everyone else.',
        responses: {
          200: dataResponse(OverviewSchema),
          ...unauthorized,
        },
      }),
      async (context) =>
        context.json({ data: await tickets().overview(actorOf(context)) }),
    );

    routes.get(
      '/tickets',
      describeRoute({
        tags,
        summary: 'List tickets the caller may see',
        operationId: 'serviceDeskTicketsList',
        responses: {
          200: listResponse(TicketListItemSchema, TicketListMetaSchema),
          ...unauthorized,
        },
      }),
      apiValidator('query', ListTicketsQuery),
      async (context) => {
        const query = context.req.valid('query');
        const result = await tickets().list(actorOf(context), {
          status: query.status,
          assigneeId: query.assigneeId,
          requesterId: query.requesterId,
          scope: query.scope,
          overdue:
            query.overdue === undefined ? undefined : query.overdue === 'true',
          search: query.search,
          limit: query.limit,
          offset: query.offset,
        });
        return context.json({
          data: result.records,
          meta: { total: result.total },
        });
      },
    );

    routes.post(
      '/tickets',
      describeRoute({
        tags,
        summary: 'Raise a ticket',
        operationId: 'serviceDeskTicketsCreate',
        description:
          'The caller is the requester. Attachments are uploaded first and passed as file ids.',
        responses: {
          201: dataResponse(
            TicketViewSchema,
            'The created ticket, in the `submitted` state.',
          ),
          400: apiErrorResponse(
            400,
            'A required field is missing or invalid (`INVALID_INPUT`).',
          ),
          ...unauthorized,
        },
      }),
      apiValidator('json', CreateTicketInput),
      async (context) => {
        const view = await tickets().create(
          actorOf(context),
          context.req.valid('json'),
        );
        return context.json({ data: view }, 201);
      },
    );

    routes.get(
      '/tickets/:ticketId',
      describeRoute({
        tags,
        summary: 'Get one ticket with its allowed transitions and history',
        operationId: 'serviceDeskTicketsGet',
        responses: {
          200: dataResponse(TicketViewSchema),
          404: apiErrorResponse(
            404,
            'No such ticket, or the caller may not see it (`TICKET_NOT_FOUND`).',
          ),
          ...unauthorized,
        },
      }),
      apiValidator('param', TicketParams),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const view = await tickets().view(actorOf(context), ticketId);
        if (!view) throw new TicketNotFoundError();
        return context.json({ data: view });
      },
    );

    routes.post(
      '/tickets/:ticketId/fire',
      describeRoute({
        tags,
        summary: 'Fire a transition on a ticket',
        operationId: 'serviceDeskTicketsFire',
        description:
          'The only way a ticket’s state changes. A refused transition answers with the lifecycle reason and its blockers and input problems in `metadata`.',
        responses: {
          200: dataResponse(
            TicketViewSchema,
            'The ticket as the transition left it.',
          ),
          400: apiErrorResponse(
            400,
            'The transition is refused for a precondition or the input is invalid (`INVALID_INPUT`, `CONFLICT`, …).',
          ),
          403: apiErrorResponse(
            403,
            'The caller may not perform this transition (`GUARD_REJECTED`, `NOT_MANUAL`).',
          ),
          404: apiErrorResponse(
            404,
            'No such ticket, or the caller may not see it (`TICKET_NOT_FOUND`).',
          ),
          ...unauthorized,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', FireTicketInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const body = context.req.valid('json');
        const view = await tickets().fire(actorOf(context), ticketId, {
          transition: body.transition,
          input: body.input as JsonObject | undefined,
          expectVersion: body.expectVersion,
          requestId: body.requestId,
        });
        return context.json({ data: view });
      },
    );

    routes.get(
      '/tickets/:ticketId/notes',
      describeRoute({
        tags,
        summary: 'List a ticket’s handling notes and comments',
        operationId: 'serviceDeskTicketsNotesList',
        responses: {
          200: dataResponse(z.array(TicketNoteSchema)),
          404: apiErrorResponse(
            404,
            'No such ticket, or the caller may not see it (`TICKET_NOT_FOUND`).',
          ),
          ...unauthorized,
        },
      }),
      apiValidator('param', TicketParams),
      async (context) =>
        context.json({
          data: await tickets().notes(
            actorOf(context),
            context.req.valid('param').ticketId,
          ),
        }),
    );

    routes.post(
      '/tickets/:ticketId/notes',
      describeRoute({
        tags,
        summary: 'Add a handling note or comment to a ticket',
        operationId: 'serviceDeskTicketsNotesCreate',
        description:
          'A `handling` note is recorded as a comment when the caller is neither the service desk nor the assigned engineer.',
        responses: {
          201: dataResponse(TicketNoteSchema),
          404: apiErrorResponse(
            404,
            'No such ticket, or the caller may not see it (`TICKET_NOT_FOUND`).',
          ),
          ...unauthorized,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', AddNoteInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { content, kind } = context.req.valid('json');
        const note = await tickets().addNote(
          actorOf(context),
          ticketId,
          content,
          kind ?? 'comment',
        );
        return context.json({ data: note }, 201);
      },
    );

    routes.get(
      '/engineers',
      describeRoute({
        tags,
        summary: 'List the engineers a ticket may be assigned to',
        operationId: 'serviceDeskEngineersList',
        responses: {
          200: dataResponse(z.array(ServiceDeskUserSchema)),
          ...unauthorized,
        },
      }),
      async (context) => context.json({ data: await tickets().engineers() }),
    );

    routes.get(
      '/directory',
      describeRoute({
        tags,
        summary: 'Search people to grant a service desk role',
        operationId: 'serviceDeskDirectoryList',
        responses: {
          200: dataResponse(z.array(ServiceDeskUserSchema)),
          ...unauthorized,
        },
      }),
      apiValidator('query', DirectoryQuery),
      async (context) =>
        context.json({
          data: await tickets().directory(
            context.req.valid('query').search ?? '',
          ),
        }),
    );

    // Managing who is on the service desk. Helpdesk only.
    routes.use('/staff', requireHelpdesk);
    routes.use('/staff/*', requireHelpdesk);

    routes.get(
      '/staff',
      describeRoute({
        tags,
        summary: 'List the service desk staff and their roles',
        operationId: 'serviceDeskStaffList',
        responses: {
          200: dataResponse(z.array(StaffMemberSchema)),
          403: apiErrorResponse(
            403,
            'The caller is not on the service desk (`HELPDESK_ONLY`).',
          ),
          ...unauthorized,
        },
      }),
      async (context) => context.json({ data: await tickets().staff() }),
    );

    routes.put(
      '/staff/:userId',
      describeRoute({
        tags,
        summary: 'Set or clear a person’s service desk role',
        operationId: 'serviceDeskStaffSetRole',
        description:
          'Send `null` to remove the role, making the person an ordinary employee again.',
        responses: {
          204: emptyResponse('The role was set or cleared.'),
          403: apiErrorResponse(
            403,
            'The caller is not on the service desk (`HELPDESK_ONLY`).',
          ),
          ...unauthorized,
        },
      }),
      apiValidator('param', StaffParams),
      apiValidator('json', SetRoleInput),
      async (context) => {
        const { userId } = context.req.valid('param');
        await tickets().setRole(userId, context.req.valid('json').role);
        return context.body(null, 204);
      },
    );

    router.route('/serviceDesk', routes);
    return router;
  });

export default apiRoutes;
