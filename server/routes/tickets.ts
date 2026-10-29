import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { Application } from '@nocobase/app-server/application';
import { i18nToken } from '@nocobase/app-server/i18n';
import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  apiErrorStatusFromHttp,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
  ApiError,
} from '@nocobase/app-server/router';
import {
  getRequestLocale,
  getRequestTranslator,
  isAppI18nError,
  serializeI18nError,
  type AppI18nError,
  type I18nRuntime,
} from '@nocobase/i18n/server';
import { Hono, type Context } from 'hono';

import {
  lifecycleRuntimeToken,
  ticketServiceToken,
} from '../providers/helpdesk.js';
import { TICKET_ACTIONS, type TicketAction } from '../tickets/resources.js';
import type { TicketService } from '../tickets/service.js';
import type { TicketDetail } from '../tickets/service.js';
import { lifecycleDescriptionView } from '@nocobase/lifecycle';
import { TicketPeopleService } from '../tickets/people.js';
import { withTicketTranslator } from '../tickets/i18n.js';
import { databaseManagerToken } from '@nocobase/db';
import {
  AccessResponse,
  AttachmentInput,
  CommentInput,
  CreateTicketInput,
  EngineerResponse,
  FireTicketInput,
  LifecycleDescriptionResponse,
  TicketDashboardResponse,
  TicketDetailResponse,
  TicketParams,
  TicketQuery,
  TicketResponse,
} from './schemas.js';

type HelpdeskEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

type HelpdeskContext = Context<HelpdeskEnv>;

const NS = 'nb3-factory';

const localizedMessage = (
  context: HelpdeskContext,
  key: string,
  params?: Record<string, unknown>,
) => ({
  locale: getRequestLocale(context) ?? 'en-US',
  message: getRequestTranslator(context, NS)(key, params),
});

const blockerMessage = (error: unknown): string | undefined => {
  const details = error as {
    blockers?: readonly { message?: unknown }[];
    problems?: readonly { message?: unknown }[];
  };
  const message =
    details.blockers?.[0]?.message ?? details.problems?.[0]?.message;
  return typeof message === 'string' && message.length > 0
    ? message
    : undefined;
};

const i18nApiError = (
  i18n: I18nRuntime,
  context: HelpdeskContext,
  error: AppI18nError,
): ApiError => {
  const locale = getRequestLocale(context) ?? 'en-US';
  const serialized = serializeI18nError(i18n, error, locale);
  return new ApiError({
    status: apiErrorStatusFromHttp(error.status),
    reason: serialized.code,
    domain: 'helpdesk',
    message: serialized.message,
    localizedMessage: { locale, message: serialized.message },
    metadata: {
      ns: serialized.ns,
      key: serialized.key,
      ...(serialized.params ? { params: serialized.params } : {}),
    },
    cause: error,
  });
};

const actorId = (context: HelpdeskContext): string => {
  const id = context.get('auth')?.user?.id;
  if (!id) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTHENTICATION_REQUIRED',
      domain: 'helpdesk',
      message: 'A signed-in user is required.',
      localizedMessage: localizedMessage(
        context,
        'helpdesk.errors.authenticationRequired',
      ),
    });
  }
  return id;
};

const authorizeTicket = async (
  context: HelpdeskContext,
  action: TicketAction,
): Promise<unknown> => {
  const decision = await context.get('authz').authorize({
    resource: { type: 'composite', id: 'helpdesk.tickets' },
    action,
  });
  if (decision.effect === 'deny') {
    throw new AuthorizationDeniedError(decision);
  }
  const policies = decision.conditions?.database as
    Record<string, unknown> | undefined;
  if (policies && Object.hasOwn(policies, 'tickets')) {
    return policies.tickets;
  }
  // A conditional permission without a database scope does not describe which
  // rows are readable. Only an unconditional permit is unrestricted.
  return decision.effect === 'permit';
};

const notFound = (context: HelpdeskContext, id: string): ApiError =>
  new ApiError({
    status: 'NOT_FOUND',
    reason: 'TICKET_NOT_FOUND',
    domain: 'helpdesk',
    message: `Ticket ${id} was not found.`,
    localizedMessage: localizedMessage(
      context,
      'helpdesk.errors.ticketNotFound',
      { ticketId: id },
    ),
  });

const requireTicket = async (
  service: TicketService,
  context: HelpdeskContext,
  action: TicketAction,
) => {
  const policy = await authorizeTicket(context, action);
  const ticketId = context.req.param('ticketId') ?? '';
  const ticket = await service.requireTicket(policy as never, ticketId);
  if (!ticket) throw notFound(context, ticketId);
  return { ticket, policy };
};

const transitionRefused = (
  context: HelpdeskContext,
  error: unknown,
): ApiError =>
  new ApiError({
    status: 'FAILED_PRECONDITION',
    reason: 'TICKET_TRANSITION_REFUSED',
    domain: 'helpdesk',
    message:
      error instanceof Error ? error.message : 'The transition was refused.',
    localizedMessage: {
      locale: getRequestLocale(context) ?? 'en-US',
      message:
        blockerMessage(error) ??
        getRequestTranslator(context, NS)('helpdesk.errors.transitionRefused'),
    },
    cause: error,
  });

export const ticketRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const routes = new Hono<HelpdeskEnv>();
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const service = app.container.resolve(ticketServiceToken);
    const runtime = app.container.resolve(lifecycleRuntimeToken);
    const i18n = app.container.resolve(i18nToken);
    const database = app.container.resolve(databaseManagerToken);
    const publicBasePath =
      app.config.get<string>('app.publicBasePath')?.replace(/\/$/, '') ?? '';
    const withFileUrls = (detail: TicketDetail): TicketDetail => ({
      ...detail,
      files: detail.files.map((file) => ({
        ...file,
        contentUrl: `${publicBasePath}/uploads/tickets/${file.id}${file.ext ? `.${file.ext}` : ''}`,
      })),
    });

    routes.use('*', auth.required(), authz.middleware());
    routes.use('*', (context: HelpdeskContext, next) =>
      withTicketTranslator(getRequestTranslator(context, NS), next),
    );

    routes.get(
      '/access',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'List the ticket actions the signed-in user may perform',
        operationId: 'getTicketAccess',
        responses: {
          '200': dataResponse(AccessResponse),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const actions: Record<string, boolean> = {};
        for (const action of TICKET_ACTIONS) {
          actions[action] = await context.get('authz').can({
            resource: { type: 'composite', id: 'helpdesk.tickets' },
            action,
          });
        }
        return context.json({ data: { actions } });
      },
    );

    routes.get(
      '/engineers',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'List support engineers available for assignment',
        operationId: 'listTicketEngineers',
        responses: {
          '200': listResponse(EngineerResponse),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await authorizeTicket(context, 'assign');
        const people = new TicketPeopleService(database.connection());
        const engineers = await people.listMembers('support-engineer');
        return context.json({
          data: engineers,
          meta: { total: engineers.length },
        });
      },
    );

    routes.get(
      '/lifecycle',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'Describe the ticket lifecycle',
        operationId: 'getTicketLifecycle',
        responses: {
          '200': dataResponse(LifecycleDescriptionResponse),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await authorizeTicket(context, 'view');
        return context.json({
          data: lifecycleDescriptionView(runtime, 'tickets'),
        });
      },
    );

    routes.get(
      '/dashboard',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'Summarize the tickets visible to the signed-in user',
        operationId: 'getTicketDashboard',
        responses: {
          '200': dataResponse(TicketDashboardResponse),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const policy = await authorizeTicket(context, 'view');
        const result = await service.dashboard(policy as never);
        const canAssign = await context.get('authz').can({
          resource: { type: 'composite', id: 'helpdesk.tickets' },
          action: 'assign',
        });
        const people = new TicketPeopleService(database.connection());
        const viewerId = actorId(context);
        const members = canAssign
          ? await people.listMembers('support-engineer')
          : [];
        const counts = new Map(result.workload.map((row) => [row.id, row]));
        const ids = new Set<string>([
          ...(canAssign ? members.map((member) => member.id) : [viewerId]),
          ...(canAssign ? result.workload.map((row) => row.id) : []),
        ]);
        const names = new Map(
          (await people.namesByIds([...ids])).map((row) => [row.id, row.name]),
        );
        const workload = [...ids]
          .map((id) => ({
            id,
            name: names.get(id) ?? id,
            active: counts.get(id)?.active ?? 0,
            escalated: counts.get(id)?.escalated ?? 0,
          }))
          .sort(
            (left, right) =>
              right.active - left.active || left.name.localeCompare(right.name),
          );
        return context.json({ data: { ...result, workload } });
      },
    );

    routes.get(
      '/',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'List tickets visible to the signed-in user',
        operationId: 'listTickets',
        responses: {
          '200': listResponse(TicketResponse),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', TicketQuery),
      async (context) => {
        const policy = await authorizeTicket(context, 'view');
        const query = context.req.valid('query');
        const result = await service.list(policy as never, {
          page: query.page,
          pageSize: query.pageSize,
          status: query.status,
          category: query.category,
          priority: query.priority,
          keyword: query.q,
        });
        return context.json({
          data: result.items,
          meta: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
          },
        });
      },
    );

    routes.get(
      '/:ticketId',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'Get a ticket with comments, attachments and lifecycle state',
        operationId: 'getTicket',
        responses: {
          '200': dataResponse(TicketDetailResponse),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { policy } = await requireTicket(service, context, 'view');
        const detail = await service.detail(policy as never, ticketId);
        if (!detail) throw notFound(context, ticketId);
        const lifecycle = await runtime.view('tickets', ticketId, {
          id: actorId(context),
        });
        return context.json({
          data: { ...withFileUrls(detail), lifecycle },
        });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'Create a ticket for the signed-in requester',
        operationId: 'createTicket',
        responses: {
          '201': dataResponse(TicketResponse),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateTicketInput),
      async (context) => {
        await authorizeTicket(context, 'create');
        const input = context.req.valid('json');
        if (input.attachmentIds?.length) {
          await authorizeTicket(context, 'attach');
        }
        try {
          const ticket = await service.create(actorId(context), input);
          return context.json({ data: ticket }, 201);
        } catch (error) {
          if (isAppI18nError(error)) {
            throw i18nApiError(i18n, context, error);
          }
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'TICKET_CREATE_FAILED',
            domain: 'helpdesk',
            message:
              error instanceof Error
                ? error.message
                : 'The ticket was not created.',
            localizedMessage: {
              locale: getRequestLocale(context) ?? 'en-US',
              message:
                blockerMessage(error) ??
                getRequestTranslator(
                  context,
                  NS,
                )('helpdesk.errors.createFailed'),
            },
            cause: error,
          });
        }
      },
    );

    routes.post(
      '/:ticketId/fire',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'Move a ticket through a lifecycle transition',
        operationId: 'fireTicketTransition',
        responses: {
          '200': dataResponse(TicketDetailResponse),
          '400': apiErrorResponse(400),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', FireTicketInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const input = context.req.valid('json');
        const action = input.transition as TicketAction;
        const { policy } = await requireTicket(service, context, action);
        const values = {
          ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
          ...(input.resolution ? { resolution: input.resolution } : {}),
          ...(input.closeNote ? { closeNote: input.closeNote } : {}),
          ...(input.cancelReason ? { cancelReason: input.cancelReason } : {}),
          ...(input.reason ? { reason: input.reason } : {}),
        };
        try {
          await service.fire(
            ticketId,
            input.transition,
            actorId(context),
            values,
            input.requestId ?? crypto.randomUUID(),
            input.expectedVersion,
          );
        } catch (error) {
          if (isAppI18nError(error)) {
            throw i18nApiError(i18n, context, error);
          }
          throw transitionRefused(context, error);
        }
        const detail = await service.detail(policy as never, ticketId);
        if (!detail) throw notFound(context, ticketId);
        const lifecycle = await runtime.view('tickets', ticketId, {
          id: actorId(context),
        });
        return context.json({
          data: { ...withFileUrls(detail), lifecycle },
        });
      },
    );

    routes.post(
      '/:ticketId/comments',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'Comment on a ticket',
        operationId: 'commentOnTicket',
        responses: {
          '201': dataResponse(TicketDetailResponse),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', CommentInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { policy } = await requireTicket(service, context, 'comment');
        const input = context.req.valid('json');
        try {
          await service.addComment(ticketId, actorId(context), input.body);
        } catch (error) {
          if (isAppI18nError(error)) {
            throw i18nApiError(i18n, context, error);
          }
          throw transitionRefused(context, error);
        }
        const detail = await service.detail(policy as never, ticketId);
        if (!detail) throw notFound(context, ticketId);
        const lifecycle = await runtime.view('tickets', ticketId, {
          id: actorId(context),
        });
        return context.json(
          { data: { ...withFileUrls(detail), lifecycle } },
          201,
        );
      },
    );

    routes.post(
      '/:ticketId/attachments',
      describeRoute({
        tags: ['Helpdesk'],
        summary: 'Attach uploaded files to a ticket',
        operationId: 'attachFilesToTicket',
        responses: {
          '200': dataResponse(TicketDetailResponse),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TicketParams),
      apiValidator('json', AttachmentInput),
      async (context) => {
        const { ticketId } = context.req.valid('param');
        const { policy } = await requireTicket(service, context, 'attach');
        const input = context.req.valid('json');
        try {
          await service.linkAttachments(
            ticketId,
            actorId(context),
            input.attachmentIds,
          );
        } catch (error) {
          if (isAppI18nError(error)) {
            throw i18nApiError(i18n, context, error);
          }
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'TICKET_ATTACHMENT_FAILED',
            domain: 'helpdesk',
            message:
              error instanceof Error
                ? error.message
                : 'The files were not attached.',
            localizedMessage: {
              locale: getRequestLocale(context) ?? 'en-US',
              message:
                blockerMessage(error) ??
                getRequestTranslator(
                  context,
                  NS,
                )('helpdesk.errors.attachmentFailed'),
            },
            cause: error,
          });
        }
        const detail = await service.detail(policy as never, ticketId);
        if (!detail) throw notFound(context, ticketId);
        const lifecycle = await runtime.view('tickets', ticketId, {
          id: actorId(context),
        });
        return context.json({
          data: { ...withFileUrls(detail), lifecycle },
        });
      },
    );

    router.route('/tickets', routes);
    return router;
  });
