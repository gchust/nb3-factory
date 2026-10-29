import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
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
import { databaseManagerToken, type FilterBuilder } from '@nocobase/db';
import { getRequestLocale, getRequestTranslator } from '@nocobase/i18n/server';
import { lifecycleDescriptionView } from '@nocobase/lifecycle';
import { Hono, type Context } from 'hono';

import { lifecycleRuntimeToken } from '../providers/helpdesk.js';
import type { TicketRecord } from '../tickets/types.js';
import {
  WorkflowDefinitionResponse,
  WorkflowExecutionDetailResponse,
  WorkflowExecutionParams,
  WorkflowExecutionQuery,
  WorkflowExecutionResponse,
  WorkflowParams,
} from './schemas.js';

type WorkflowEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

type WorkflowContext = Context<WorkflowEnv>;

const NS = 'nb3-factory';

const localizedMessage = (
  context: WorkflowContext,
  key: string,
  params?: Record<string, unknown>,
) => ({
  locale: getRequestLocale(context) ?? 'en-US',
  message: getRequestTranslator(context, NS)(key, params),
});

const requireRead = async (context: WorkflowContext): Promise<void> => {
  await context.get('authz').require({
    resource: { type: 'settings', id: 'workflow-management' },
    action: 'read',
  });
};

const notFound = (context: WorkflowContext, recordId: string): ApiError =>
  new ApiError({
    status: 'NOT_FOUND',
    reason: 'WORKFLOW_EXECUTION_NOT_FOUND',
    domain: 'helpdesk',
    message: `Workflow execution ${recordId} was not found.`,
    localizedMessage: localizedMessage(
      context,
      'helpdesk.errors.workflowExecutionNotFound',
      { recordId },
    ),
  });

export const workflowRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const routes = new Hono<WorkflowEnv>();
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const runtime = app.container.resolve(lifecycleRuntimeToken);
    const database = app.container.resolve(databaseManagerToken);

    routes.use('*', auth.required(), authz.middleware());

    routes.get(
      '/definitions',
      describeRoute({
        tags: ['Workflow management'],
        summary: 'List registered workflow definitions',
        operationId: 'listWorkflowDefinitions',
        responses: {
          '200': listResponse(WorkflowDefinitionResponse),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await requireRead(context);
        const description = runtime.describe('tickets');
        const view = lifecycleDescriptionView(runtime, 'tickets');
        const executionCount = await database
          .repository('lifecycleTransitions')
          .count({ filter: { lifecycle: 'tickets' } });
        return context.json({
          data: [
            {
              name: description.name,
              title: getRequestTranslator(
                context,
                NS,
              )('helpdesk.workflow.definitionTitle'),
              collection: 'tickets',
              stateField: 'status',
              initial: description.initial,
              states: description.states,
              description,
              transitions: description.transitions,
              triggers: description.triggers,
              parameters: runtime.parameters('tickets'),
              diagram: view.diagram,
              executionCount,
            },
          ],
          meta: { total: 1 },
        });
      },
    );

    routes.get(
      '/definitions/:workflowName',
      describeRoute({
        tags: ['Workflow management'],
        summary: 'Describe one registered workflow definition',
        operationId: 'getWorkflowDefinition',
        responses: {
          '200': dataResponse(WorkflowDefinitionResponse),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', WorkflowParams),
      async (context) => {
        await requireRead(context);
        const { workflowName } = context.req.valid('param');
        if (workflowName !== 'tickets') {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'WORKFLOW_NOT_FOUND',
            domain: 'helpdesk',
            message: `Workflow ${workflowName} was not found.`,
            localizedMessage: localizedMessage(
              context,
              'helpdesk.errors.workflowNotFound',
              { workflowName },
            ),
          });
        }
        const description = runtime.describe('tickets');
        const view = lifecycleDescriptionView(runtime, 'tickets');
        const executionCount = await database
          .repository('lifecycleTransitions')
          .count({ filter: { lifecycle: 'tickets' } });
        return context.json({
          data: {
            name: description.name,
            title: getRequestTranslator(
              context,
              NS,
            )('helpdesk.workflow.definitionTitle'),
            collection: 'tickets',
            stateField: 'status',
            initial: description.initial,
            states: description.states,
            description,
            transitions: description.transitions,
            triggers: description.triggers,
            parameters: runtime.parameters('tickets'),
            diagram: view.diagram,
            executionCount,
          },
        });
      },
    );

    routes.get(
      '/executions',
      describeRoute({
        tags: ['Workflow management'],
        summary: 'List workflow executions over business records',
        operationId: 'listWorkflowExecutions',
        responses: {
          '200': listResponse(WorkflowExecutionResponse),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', WorkflowExecutionQuery),
      async (context) => {
        await requireRead(context);
        const query = context.req.valid('query');
        if (query.workflowName && query.workflowName !== 'tickets') {
          return context.json({
            data: [],
            meta: { page: query.page, pageSize: query.pageSize, total: 0 },
          });
        }

        const repository = database.repository<TicketRecord>('tickets');
        const filter = (f: FilterBuilder<TicketRecord>) => {
          const parts = [
            ...(query.state ? [f.string('status').eq(query.state)] : []),
            ...(query.q
              ? [
                  f.or([
                    f.string('ticketNo').includes(query.q),
                    f.string('title').includes(query.q),
                  ]),
                ]
              : []),
          ];
          return parts.length ? f.and(parts) : f.and([]);
        };

        const [tickets, total] = await Promise.all([
          repository.findMany({
            filter,
            sort: (sort) => sort.field('updatedAt').desc(),
            limit: query.pageSize,
            offset: (query.page - 1) * query.pageSize,
          }),
          repository.count({ filter }),
        ]);

        const transitions = database.repository('lifecycleTransitions');
        const data = await Promise.all(
          tickets.map(async (ticket) => ({
            recordId: String(ticket.id),
            ticketNo: String(ticket.ticketNo),
            title: String(ticket.title),
            state: String(ticket.status),
            version:
              typeof ticket.lifecycleVersion === 'number'
                ? ticket.lifecycleVersion
                : null,
            statusChangedAt: new Date(ticket.statusChangedAt).toISOString(),
            assigneeId:
              typeof ticket.assigneeId === 'string' ? ticket.assigneeId : null,
            requesterId: String(ticket.requesterId),
            transitionCount: await transitions.count({
              filter: {
                lifecycle: 'tickets',
                recordId: String(ticket.id),
              },
            }),
          })),
        );

        return context.json({
          data,
          meta: { page: query.page, pageSize: query.pageSize, total },
        });
      },
    );

    routes.get(
      '/executions/:recordId',
      describeRoute({
        tags: ['Workflow management'],
        summary: 'Get one workflow execution with its history',
        operationId: 'getWorkflowExecution',
        responses: {
          '200': dataResponse(WorkflowExecutionDetailResponse),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', WorkflowExecutionParams),
      async (context) => {
        await requireRead(context);
        const { recordId } = context.req.valid('param');
        const ticket = await database
          .repository<TicketRecord>('tickets')
          .findOne({ filter: { id: recordId } });
        if (!ticket) throw notFound(context, recordId);

        const history = await runtime.history('tickets', recordId);
        const view = await runtime.view('tickets', recordId, {
          id: context.get('auth')?.user?.id ?? 'system',
          system: true,
        });
        return context.json({
          data: {
            recordId,
            ticketNo: String(ticket.ticketNo),
            title: String(ticket.title),
            state: String(ticket.status),
            version:
              typeof ticket.lifecycleVersion === 'number'
                ? ticket.lifecycleVersion
                : null,
            statusChangedAt: new Date(ticket.statusChangedAt).toISOString(),
            assigneeId:
              typeof ticket.assigneeId === 'string' ? ticket.assigneeId : null,
            requesterId: String(ticket.requesterId),
            transitionCount: history.transitions.length,
            history,
            available: view.available,
            description: lifecycleDescriptionView(runtime, 'tickets'),
          },
        });
      },
    );

    router.route('/workflows', routes);
    return router;
  });
