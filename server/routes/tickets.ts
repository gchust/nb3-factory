import { Hono } from 'hono';
import { z } from 'zod';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AuthorizationEnv } from '@nocobase/authorization/core';
import type { Application } from '@nocobase/app-server/application';
import {
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

import { itServiceDeskToken } from '../it-service-desk/tokens.js';
import {
  CreateTeamMemberInput,
  CreateTicketInput,
  EngineerSchema,
  FireTicketInput,
  ListTicketsQuery,
  SetTeamMemberRolesInput,
  TeamMemberParams,
  TeamMemberSchema,
  TeamSchema,
  TicketDashboardSchema,
  TicketPageMeta,
  TicketParams,
  TicketSchema,
} from './schemas.js';

const tags = ['IT service desk'];

/**
 * The IT service desk endpoints. Authentication is required; what a caller may see and do is decided by the
 * application's Permission Sets in `ItServiceDeskService`, which every handler calls.
 */
export const ticketApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthorizationEnv>();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const service = () => app.container.resolve(itServiceDeskToken);

    router.onError(apiErrorHandler);
    router.use(
      '/tickets',
      authentication.required(),
      authorization.middleware(),
    );
    router.use(
      '/tickets/*',
      authentication.required(),
      authorization.middleware(),
    );

    // Fixed segments are registered before `/:ticketId`, which would otherwise match them.
    router.get(
      '/tickets/dashboard',
      describeRoute({
        tags,
        summary: 'Get the ticket dashboard',
        operationId: 'itTicketsGetDashboard',
        description:
          'Pending assignment, overdue tickets and each engineer’s open workload, scoped to what the caller may see.',
        responses: {
          200: dataResponse(TicketDashboardSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const viewer = await service().viewer(context.get('authz'));
        return context.json({ data: await service().dashboard(viewer) });
      },
    );

    router.get(
      '/tickets/engineers',
      describeRoute({
        tags,
        summary: 'List the engineers and their open workload',
        operationId: 'itTicketsListEngineers',
        responses: {
          200: dataResponse(z.array(EngineerSchema)),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await service().viewer(context.get('authz'));
        return context.json({ data: await service().engineers() });
      },
    );

    router.get(
      '/tickets/team',
      describeRoute({
        tags,
        summary: 'List team members and assignable roles',
        operationId: 'itTicketsListTeam',
        description:
          'Administrator only. Members with their roles, plus the roles this application lets an administrator assign.',
        responses: {
          200: dataResponse(TeamSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) =>
        context.json({ data: await service().team(context.get('authz')) }),
    );

    router.post(
      '/tickets/team',
      describeRoute({
        tags,
        summary: 'Create a team member',
        operationId: 'itTicketsCreateTeamMember',
        description: 'Administrator only.',
        responses: {
          200: dataResponse(TeamMemberSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateTeamMemberInput),
      async (context) =>
        context.json({
          data: await service().createMember(
            context.get('authz'),
            context.req.valid('json'),
          ),
        }),
    );

    router.put(
      '/tickets/team/:userId/roles',
      describeRoute({
        tags,
        summary: 'Replace a team member’s roles',
        operationId: 'itTicketsSetTeamMemberRoles',
        description: 'Administrator only.',
        responses: {
          200: dataResponse(TeamMemberSchema),
          404: apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TeamMemberParams),
      apiValidator('json', SetTeamMemberRolesInput),
      async (context) =>
        context.json({
          data: await service().setMemberRoles(
            context.get('authz'),
            context.req.valid('param').userId,
            context.req.valid('json').roles,
          ),
        }),
    );

    router.get(
      '/tickets',
      describeRoute({
        tags,
        summary: 'List tickets',
        operationId: 'itTicketsList',
        description:
          'Scoped to the caller: an employee sees only the tickets they reported, an engineer only the tickets assigned to them, and the service desk every ticket.',
        responses: {
          200: listResponse(TicketSchema, TicketPageMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListTicketsQuery),
      async (context) => {
        const viewer = await service().viewer(context.get('authz'));
        const result = await service().list(viewer, context.req.valid('query'));
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
      '/tickets',
      describeRoute({
        tags,
        summary: 'Report a ticket',
        operationId: 'itTicketsCreate',
        responses: {
          200: dataResponse(TicketSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateTicketInput),
      async (context) => {
        const viewer = await service().viewer(context.get('authz'));
        return context.json({
          data: await service().create(viewer, context.req.valid('json')),
        });
      },
    );

    router.get(
      '/tickets/:ticketId',
      describeRoute({
        tags,
        summary: 'Get one ticket',
        operationId: 'itTicketsGet',
        description:
          'Includes the transitions the caller may fire and the full transition log.',
        responses: {
          200: dataResponse(TicketSchema),
          404: apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      async (context) => {
        const viewer = await service().viewer(context.get('authz'));
        return context.json({
          data: await service().get(
            viewer,
            context.req.valid('param').ticketId,
          ),
        });
      },
    );

    router.post(
      '/tickets/:ticketId/fire',
      describeRoute({
        tags,
        summary: 'Run a ticket transition',
        operationId: 'itTicketsFire',
        description:
          'The service desk assigns, reassigns and resolves; the assigned engineer records progress and the solution; the reporter confirms or returns the ticket. `remind` is triggered by the server and is never accepted here.',
        responses: {
          200: dataResponse(TicketSchema),
          404: apiErrorResponse(404),
          409: apiErrorResponse(409),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', FireTicketInput),
      async (context) => {
        const viewer = await service().viewer(context.get('authz'));
        return context.json({
          data: await service().fire(
            viewer,
            context.req.valid('param').ticketId,
            context.req.valid('json'),
          ),
        });
      },
    );

    return router as unknown as Hono;
  });
