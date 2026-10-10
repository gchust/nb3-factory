import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import type { DatabaseManager } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { z } from 'zod';

import { listOrders } from '../services/orders.js';
import type { RequestServiceContext } from '../services/context.js';
import {
  assistantStatusServiceToken,
  type AssistantStatus,
  type AssistantStatusService,
} from '../services/tokens.js';

export const ASSISTANT_EMPLOYEE = 'service-assistant';
export const ORDER_LOOKUP_TOOL = 'serviceOrderLookup';

const orderLookupSchema = z.object({
  keyword: z
    .string()
    .optional()
    .describe('A word to match against the order number or the order title.'),
  status: z
    .enum([
      'pending_acceptance',
      'pending_processing',
      'processing',
      'pending_confirmation',
      'closed',
    ])
    .optional()
    .describe('Restrict the result to orders in this lifecycle state.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('How many orders to return, at most 20.'),
});

/**
 * Registers the after-sales assistant employee and the order-lookup tool it may call.
 *
 * The tool reads orders through the same composite authorization an HTTP request
 * goes through, scoped to the identity the conversation runs as. A tool call can
 * therefore never return an order the signed-in user is not allowed to read: the
 * permission set decides, exactly as it does on the order page.
 *
 * The chat surface itself lives in the AI Employee client plugin
 * (`client/extensions/nocobase-ai` is not installed here), so this application
 * registers the employee and its capability without shipping a chat page.
 */
export default class ServiceAssistantProvider extends ServiceProvider<Application> {
  public readonly name = 'app/service-assistant';

  public override register(): void {
    this.app.container.singleton(assistantStatusServiceToken, () => {
      const service: AssistantStatusService = {
        describe: () => this.describeAssistant(),
      };
      return service;
    });
  }

  /**
   * Reports what is registered right now.
   *
   * The managers are asked rather than the source being believed, so a page
   * that reads this cannot show a registered assistant while the registry is
   * empty — and cannot show a failure that has not happened either.
   */
  private async describeAssistant(): Promise<AssistantStatus> {
    const configuredServices = Object.keys(
      this.app.config.get<{ llmServices?: Record<string, unknown> }>('ai')
        ?.llmServices ?? {},
    );
    if (!this.app.container.has(aiManagerToken)) {
      return {
        employee: {
          username: ASSISTANT_EMPLOYEE,
          nickname: 'After-sales assistant',
          registered: false,
        },
        tools: [{ name: ORDER_LOOKUP_TOOL, registered: false }],
        llmServices: configuredServices,
        responderReady: false,
        chatSurface: 'not-installed',
      };
    }
    const ai = this.app.container.resolve(aiManagerToken);
    const employee = await ai.employeeManager.getEmployee(ASSISTANT_EMPLOYEE);
    const toolRegistered =
      await ai.toolsManager.isToolsExisted(ORDER_LOOKUP_TOOL);
    return {
      employee: {
        username: ASSISTANT_EMPLOYEE,
        nickname: employee?.nickname ?? 'After-sales assistant',
        registered: Boolean(employee),
      },
      tools: [{ name: ORDER_LOOKUP_TOOL, registered: toolRegistered }],
      llmServices: configuredServices,
      responderReady: Boolean(employee) && configuredServices.length > 0,
      chatSurface: 'not-installed',
    };
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(aiManagerToken)) {
      this.app.container
        .resolve(loggingToken)
        .getLogger()
        .warn(
          'The AI employee plugin is not registered; the service assistant was not created.',
        );
      return;
    }
    const ai = this.app.container.resolve(aiManagerToken);
    const logger = this.app.container.resolve(loggingToken).getLogger();

    await ai.employeeManager.registerEmployee({
      username: ASSISTANT_EMPLOYEE,
      nickname: 'After-sales assistant',
      position: 'Service support',
      description:
        'Answers questions about after-sales work orders and points engineers at the right order.',
      systemPrompt:
        'You support an equipment after-sales service team. Answer from the tool results only, never invent an order or a status. Reply in the language the user writes in.',
      skills: [],
      tools: [{ name: ORDER_LOOKUP_TOOL, autoCall: true }],
      sort: 20,
    });

    await ai.toolsManager.registerTools({
      scope: 'SPECIFIED',
      execution: 'backend',
      requiresContext: true,
      defaultPermission: 'ALLOW',
      i18n: undefined,
      introduction: {
        title: 'Look up service orders',
        about: 'Reads the service orders the current user is allowed to see.',
      },
      definition: {
        name: ORDER_LOOKUP_TOOL,
        description:
          'Look up after-sales service orders the current user is authorized to read. Returns each order number, title, status, priority and due date, newest first.',
        schema: orderLookupSchema,
      },
      dependencies: {
        authorization: authorizationToken,
        database: databaseManagerToken,
      },
      invoke: async (ctx, args) => {
        const parsed = orderLookupSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            status: 'error',
            content: {
              message:
                'Invalid arguments. Provide an optional keyword, status and limit.',
            },
          };
        }
        // `registerTools` is declared over an erased dependency map, so the
        // resolved dependencies arrive untyped. The tokens named above are what
        // is actually resolved; restating them here is a type/implementation gap
        // rather than a change of behaviour.
        const deps = ctx.deps as unknown as {
          authorization: AppAuthorization;
          database: DatabaseManager;
        };
        const authz = deps.authorization.for({
          principal: { type: 'user', id: String(ctx.actor.id) },
        });
        const context: RequestServiceContext = {
          authz,
          actorId: String(ctx.actor.id),
          policies: {},
          database: deps.database,
        };
        try {
          const result = await listOrders(context, {
            keyword: parsed.data.keyword,
            status: parsed.data.status,
            limit: parsed.data.limit ?? 10,
          });
          return {
            status: 'success',
            content: {
              total: result.total,
              orders: result.rows.map((order) => ({
                orderNo: order.orderNo,
                title: order.title,
                status: order.status,
                priority: order.priority,
                dueAt: order.dueAt,
              })),
            },
          };
        } catch (error) {
          logger.debug(
            { error },
            'The service assistant order lookup was refused.',
          );
          return {
            status: 'error',
            content: {
              message: 'No authorized orders are available for this request.',
            },
          };
        }
      },
    });

    logger.info(
      { employee: ASSISTANT_EMPLOYEE, tool: ORDER_LOOKUP_TOOL },
      'Service assistant registered',
    );
  }
}
