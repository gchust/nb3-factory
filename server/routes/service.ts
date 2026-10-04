import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization/server';

import { ServiceAccess, type ServiceActor } from '../service/access.js';
import {
  ServiceConflictError,
  ServiceForbiddenError,
  ServiceNotFoundError,
  ServiceValidationError,
} from '../service/errors.js';
import type {
  TicketAction,
  TicketCreateInput,
  TicketUpdateInput,
} from '../service/ticket-service.js';
import {
  catalogServiceToken,
  dashboardServiceToken,
  externalTicketServiceToken,
  inspectionServiceToken,
  serviceAssistantToken,
  serviceRoutingToken,
  ticketServiceToken,
} from '../service/tokens.js';

type ServiceEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

interface ServiceRouteContext {
  readonly access: ServiceAccess;
}

function failure(context: Context, error: unknown): Response {
  if (error instanceof ServiceValidationError) {
    return context.json(
      {
        code: 'VALIDATION_ERROR',
        message: error.message,
        fields: error.fields,
      },
      400,
    );
  }
  if (error instanceof ServiceNotFoundError) {
    return context.json({ code: 'NOT_FOUND', message: error.message }, 404);
  }
  if (error instanceof ServiceConflictError) {
    return context.json({ code: 'CONFLICT', message: error.message }, 409);
  }
  if (error instanceof ServiceForbiddenError) {
    return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
  }
  if (error instanceof Error && error.name === 'AuthorizationDeniedError') {
    return context.json({ code: 'FORBIDDEN', message: 'Not allowed' }, 403);
  }
  console.error('[service] request failed', error);
  return context.json(
    { code: 'INTERNAL_ERROR', message: 'Unexpected error' },
    500,
  );
}

async function run<T>(
  context: Context<ServiceEnv>,
  handler: () => Promise<T>,
  status: number = 200,
): Promise<Response> {
  try {
    return context.json({ data: await handler() }, status as 200);
  } catch (error) {
    return failure(context, error);
  }
}

function numericId(context: Context, name = 'id'): number {
  const raw = context.req.param(name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ServiceValidationError(`A valid ${name} is required`, {
      [name]: 'invalid',
    });
  }
  return value;
}

function bodyNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readJson<T>(context: Context): Promise<T> {
  try {
    return await context.req.json();
  } catch {
    throw new ServiceValidationError('A JSON body is required', {
      body: 'invalid',
    });
  }
}

function queryList(context: Context): {
  search?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  priority?: string;
  assigneeId?: number;
  customerId?: number;
  deviceId?: number;
} {
  const query = context.req.query();
  return {
    search: query.search || undefined,
    page: bodyNumber(query.page),
    pageSize: bodyNumber(query.pageSize),
    status: query.status || undefined,
    priority: query.priority || undefined,
    assigneeId: bodyNumber(query.assigneeId),
    customerId: bodyNumber(query.customerId),
    deviceId: bodyNumber(query.deviceId),
  };
}

/**
 * The equipment after-sales service HTTP surface. Every endpoint is
 * authenticated, then checked against the module's composite resources; the
 * service layer narrows records further for engineers and observers.
 */
export function createServiceRoutes(
  app: Application,
  options: ServiceRouteContext,
): Hono {
  const routes = new Hono<ServiceEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const catalog = app.container.resolve(catalogServiceToken);
  const tickets = app.container.resolve(ticketServiceToken);
  const inspections = app.container.resolve(inspectionServiceToken);
  const dashboard = app.container.resolve(dashboardServiceToken);
  const external = app.container.resolve(externalTicketServiceToken);
  const assistant = app.container.resolve(serviceAssistantToken);

  routes.use('*', auth.required(), authorization.middleware());

  function actor(context: Context<ServiceEnv>): Promise<ServiceActor> {
    const user = context.get('auth')?.user;
    if (!user) {
      throw new ServiceForbiddenError('Authentication is required');
    }
    return options.access.actor(user.id);
  }

  function guard(
    resourceId: string,
    action: string,
  ): MiddlewareHandler<ServiceEnv> {
    return async (context, next) => {
      // A database-backed composite action resolves to a `conditional`
      // decision (the row scope the caller may reach), which is an allow, not a
      // denial. `require()` only accepts `permit`, so it would reject every
      // record-scoped role. Check the effect the same way the database
      // authorizer does: only `deny` is a refusal.
      const decision = await context.get('authz').authorize({
        resource: { type: 'composite', id: resourceId },
        action,
      });
      if (decision.effect === 'deny') {
        return context.json({ code: 'FORBIDDEN', message: 'Not allowed' }, 403);
      }
      await next();
    };
  }

  // ---------------------------------------------------------------- dashboard
  routes.get('/dashboard', guard('service.dashboard', 'view'), (context) =>
    run(context, async () => dashboard.summary(await actor(context))),
  );

  // ----------------------------------------------------------------- engineers
  // The engineer roster powers assignment, sharing and inspection planning
  // pickers. It exposes only id, display name and open-ticket count.
  routes.get('/engineers', guard('service.tickets', 'view'), (context) =>
    run(context, () =>
      app.container.resolve(serviceRoutingToken).engineerLoads(),
    ),
  );

  // ---------------------------------------------------------------- customers
  routes.get('/customers', guard('service.customers', 'view'), (context) =>
    run(context, async () =>
      catalog.listCustomers(queryList(context), await actor(context)),
    ),
  );
  routes.get('/customers/:id', guard('service.customers', 'view'), (context) =>
    run(context, async () =>
      catalog.getCustomer(numericId(context), await actor(context)),
    ),
  );
  routes.post('/customers', guard('service.customers', 'create'), (context) =>
    run(
      context,
      async () => {
        const input = await readJson<Record<string, unknown>>(context);
        return catalog.createCustomer(input, await actor(context));
      },
      201,
    ),
  );
  routes.patch(
    '/customers/:id',
    guard('service.customers', 'update'),
    (context) =>
      run(context, async () => {
        const input = await readJson<Record<string, unknown>>(context);
        return catalog.updateCustomer(
          numericId(context),
          input,
          await actor(context),
        );
      }),
  );

  // ------------------------------------------------------------------ devices
  routes.get('/devices', guard('service.devices', 'view'), (context) =>
    run(context, async () =>
      catalog.listDevices(queryList(context), await actor(context)),
    ),
  );
  routes.get('/devices/:id', guard('service.devices', 'view'), (context) =>
    run(context, async () =>
      catalog.getDevice(numericId(context), await actor(context)),
    ),
  );
  routes.post('/devices', guard('service.devices', 'create'), (context) =>
    run(
      context,
      async () => {
        const input = await readJson<Record<string, unknown>>(context);
        return catalog.createDevice(
          {
            ...input,
            customerId: bodyNumber(input.customerId) ?? null,
          },
          await actor(context),
        );
      },
      201,
    ),
  );
  routes.patch('/devices/:id', guard('service.devices', 'update'), (context) =>
    run(context, async () => {
      const input = await readJson<Record<string, unknown>>(context);
      return catalog.updateDevice(
        numericId(context),
        {
          ...input,
          ...(input.customerId !== undefined
            ? { customerId: bodyNumber(input.customerId) ?? null }
            : {}),
        },
        await actor(context),
      );
    }),
  );

  // ------------------------------------------------------------------ tickets
  routes.get('/tickets', guard('service.tickets', 'view'), (context) =>
    run(context, async () =>
      tickets.list(queryList(context) as never, await actor(context)),
    ),
  );
  routes.get('/tickets/:id', guard('service.tickets', 'view'), (context) =>
    run(context, async () =>
      tickets.get(numericId(context), await actor(context)),
    ),
  );
  routes.post('/tickets', guard('service.tickets', 'create'), (context) =>
    run(
      context,
      async () => {
        const input = await readJson<Record<string, unknown>>(context);
        return tickets.create(
          normalizeTicketInput(input),
          await actor(context),
        );
      },
      201,
    ),
  );
  routes.patch('/tickets/:id', guard('service.tickets', 'update'), (context) =>
    run(context, async () => {
      const input = await readJson<Record<string, unknown>>(context);
      return tickets.update(
        numericId(context),
        normalizeTicketInput(input),
        await actor(context),
      );
    }),
  );
  routes.post(
    '/tickets/:id/actions/:action',
    (context, next) => {
      const action = context.req.param('action');
      const allowed = ['accept', 'start', 'submit', 'close', 'return'] as const;
      if (!allowed.includes(action as (typeof allowed)[number])) {
        return failure(
          context,
          new ServiceValidationError(`Unknown action ${action}`, {
            action: 'invalid',
          }),
        );
      }
      return guard('service.tickets', action)(context, next);
    },
    (context) =>
      run(context, async () => {
        const input = await readJson<{ comment?: string | null }>(
          context,
        ).catch((): { comment?: string | null } => ({}));
        return tickets.transition(
          numericId(context),
          context.req.param('action') as TicketAction,
          { comment: input.comment ?? null },
          await actor(context),
        );
      }),
  );
  routes.post(
    '/tickets/:id/comments',
    guard('service.tickets', 'update'),
    (context) =>
      run(
        context,
        async () => {
          const input = await readJson<{ comment?: string }>(context);
          return tickets.comment(
            numericId(context),
            input.comment ?? '',
            await actor(context),
          );
        },
        201,
      ),
  );
  routes.get(
    '/tickets/:id/events',
    guard('service.tickets', 'view'),
    (context) =>
      run(context, async () =>
        tickets.listEvents(numericId(context), await actor(context)),
      ),
  );
  routes.get(
    '/tickets/:id/shares',
    guard('service.tickets', 'view'),
    (context) =>
      run(context, async () =>
        tickets.listShares(numericId(context), await actor(context)),
      ),
  );
  routes.post(
    '/tickets/:id/shares',
    guard('service.tickets', 'share'),
    (context) =>
      run(
        context,
        async () => {
          const input = await readJson<Record<string, unknown>>(context);
          return tickets.share(
            numericId(context),
            {
              granteeId: bodyNumber(input.granteeId) ?? null,
              granteeName:
                typeof input.granteeName === 'string'
                  ? input.granteeName
                  : null,
              reason: typeof input.reason === 'string' ? input.reason : null,
              ttlHours: bodyNumber(input.ttlHours) ?? null,
            },
            await actor(context),
          );
        },
        201,
      ),
  );
  routes.delete(
    '/tickets/:id/shares/:shareId',
    guard('service.tickets', 'share'),
    (context) =>
      run(context, async () => {
        await tickets.revokeShare(
          numericId(context),
          numericId(context, 'shareId'),
          await actor(context),
        );
        return { revoked: true };
      }),
  );
  routes.get(
    '/tickets/:id/attachments',
    guard('service.tickets', 'view'),
    (context) =>
      run(context, async () =>
        tickets.listAttachments(numericId(context), await actor(context)),
      ),
  );
  routes.post(
    '/tickets/:id/attachments',
    guard('service.tickets', 'update'),
    (context) =>
      run(
        context,
        async () => {
          const input = await readJson<Record<string, unknown>>(context);
          if (typeof input.fileId !== 'string' || !input.fileId) {
            throw new ServiceValidationError('A file id is required', {
              fileId: 'required',
            });
          }
          return tickets.addAttachment(
            numericId(context),
            {
              fileId: input.fileId,
              kind: typeof input.kind === 'string' ? input.kind : 'repair',
              note: typeof input.note === 'string' ? input.note : null,
            },
            await actor(context),
          );
        },
        201,
      ),
  );

  routes.delete(
    '/tickets/:id/attachments/:attachmentId',
    guard('service.tickets', 'update'),
    (context) =>
      run(context, async () => {
        await tickets.removeAttachment(
          numericId(context),
          numericId(context, 'attachmentId'),
          await actor(context),
        );
        return { removed: true };
      }),
  );

  // -------------------------------------------------------------- inspections
  routes.get('/inspections', guard('service.inspections', 'view'), (context) =>
    run(context, async () =>
      inspections.list(queryList(context) as never, await actor(context)),
    ),
  );
  routes.post(
    '/inspections',
    guard('service.inspections', 'create'),
    (context) =>
      run(
        context,
        async () => {
          const input = await readJson<Record<string, unknown>>(context);
          return inspections.create(
            {
              deviceId: bodyNumber(input.deviceId) ?? null,
              plannedDate:
                typeof input.plannedDate === 'string'
                  ? input.plannedDate
                  : null,
              assigneeId: bodyNumber(input.assigneeId) ?? null,
              notes: typeof input.notes === 'string' ? input.notes : null,
            },
            await actor(context),
          );
        },
        201,
      ),
  );
  routes.patch(
    '/inspections/:id',
    guard('service.inspections', 'update'),
    (context) =>
      run(context, async () => {
        const input = await readJson<Record<string, unknown>>(context);
        return inspections.update(
          numericId(context),
          {
            notes:
              typeof input.notes === 'string'
                ? input.notes
                : input.notes === null
                  ? null
                  : undefined,
            assigneeId:
              input.assigneeId === undefined
                ? undefined
                : (bodyNumber(input.assigneeId) ?? null),
          },
          await actor(context),
        );
      }),
  );
  routes.post(
    '/inspections/:id/start',
    guard('service.inspections', 'update'),
    (context) =>
      run(context, async () =>
        inspections.start(numericId(context), await actor(context)),
      ),
  );
  routes.post(
    '/inspections/:id/complete',
    guard('service.inspections', 'complete'),
    (context) =>
      run(context, async () => {
        const input = await readJson<Record<string, unknown>>(context).catch(
          (): Record<string, unknown> => ({}),
        );
        return inspections.complete(
          numericId(context),
          {
            result: typeof input.result === 'string' ? input.result : null,
            notes: typeof input.notes === 'string' ? input.notes : null,
            createTicket: input.createTicket === true,
          },
          await actor(context),
        );
      }),
  );
  routes.post(
    '/inspections/plan',
    guard('service.inspections', 'create'),
    (context) => run(context, async () => inspections.planDue(new Date())),
  );

  // ---------------------------------------------------------------- knowledge
  routes.get('/knowledge', guard('service.knowledge', 'view'), (context) =>
    run(context, async () =>
      catalog.listKnowledge(queryList(context), await actor(context)),
    ),
  );
  routes.get('/knowledge/:id', guard('service.knowledge', 'view'), (context) =>
    run(context, async () =>
      catalog.getKnowledge(numericId(context), await actor(context)),
    ),
  );
  routes.post('/knowledge', guard('service.knowledge', 'create'), (context) =>
    run(
      context,
      async () => {
        const input = await readJson<Record<string, unknown>>(context);
        return catalog.createKnowledge(input, await actor(context));
      },
      201,
    ),
  );
  routes.patch(
    '/knowledge/:id',
    guard('service.knowledge', 'update'),
    (context) =>
      run(context, async () => {
        const input = await readJson<Record<string, unknown>>(context);
        return catalog.updateKnowledge(
          numericId(context),
          input,
          await actor(context),
        );
      }),
  );
  routes.delete(
    '/knowledge/:id',
    guard('service.knowledge', 'delete'),
    (context) =>
      run(context, async () => {
        await catalog.deleteKnowledge(numericId(context), await actor(context));
        return { deleted: true };
      }),
  );

  // ---------------------------------------------------------------- assistant
  routes.get(
    '/assistant/search',
    guard('service.knowledge', 'view'),
    (context) =>
      run(context, async () =>
        assistant.search(context.req.query('q') ?? '', await actor(context)),
      ),
  );
  routes.post(
    '/assistant/draft',
    guard('service.knowledge', 'view'),
    (context) =>
      run(context, async () => {
        const input = await readJson<Record<string, unknown>>(context);
        return assistant.draft(
          {
            ticketId: bodyNumber(input.ticketId) ?? null,
            question:
              typeof input.question === 'string' ? input.question : null,
            language:
              typeof input.language === 'string' ? input.language : null,
          },
          await actor(context),
        );
      }),
  );

  // ------------------------------------------------- external platform intake
  // Device-platform intake is a separate boundary from ordinary creation:
  // only the integration role (and an unrestricted operator) holds `ingest`,
  // and the action may not set an assignee or the confidentiality flag.
  routes.post(
    '/external/tickets',
    guard('service.tickets', 'ingest'),
    (context) =>
      run(
        context,
        async () => {
          const input = await readJson<Record<string, unknown>>(context);
          const user = context.get('auth')?.user;
          return external.ingest(
            {
              eventId: typeof input.eventId === 'string' ? input.eventId : null,
              title: typeof input.title === 'string' ? input.title : null,
              description:
                typeof input.description === 'string'
                  ? input.description
                  : null,
              priority:
                typeof input.priority === 'string' ? input.priority : null,
              deviceNo:
                typeof input.deviceNo === 'string' ? input.deviceNo : null,
              customerCode:
                typeof input.customerCode === 'string'
                  ? input.customerCode
                  : null,
              occurredAt:
                typeof input.occurredAt === 'string' ? input.occurredAt : null,
              confidential: input.confidential === true,
            },
            { id: user?.id ?? 'external', name: user?.name },
          );
        },
        201,
      ),
  );
  routes.get(
    '/external/tickets/:eventId',
    guard('service.tickets', 'ingest'),
    (context) =>
      run(context, async () => external.lookup(context.req.param('eventId'))),
  );

  return routes as unknown as Hono;
}

function normalizeTicketInput(
  input: Record<string, unknown>,
): TicketCreateInput & TicketUpdateInput {
  return {
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    ...(input.description !== undefined
      ? {
          description:
            typeof input.description === 'string' ? input.description : null,
        }
      : {}),
    ...(typeof input.priority === 'string'
      ? { priority: input.priority as TicketCreateInput['priority'] }
      : {}),
    ...(input.confidential !== undefined
      ? { confidential: input.confidential === true }
      : {}),
    ...(input.customerId !== undefined
      ? { customerId: bodyNumber(input.customerId) ?? null }
      : {}),
    ...(input.deviceId !== undefined
      ? { deviceId: bodyNumber(input.deviceId) ?? null }
      : {}),
    ...(input.assigneeId !== undefined
      ? { assigneeId: bodyNumber(input.assigneeId) ?? null }
      : {}),
    ...(typeof input.source === 'string' ? { source: input.source } : {}),
    ...(input.externalEventNo !== undefined
      ? {
          externalEventNo:
            typeof input.externalEventNo === 'string'
              ? input.externalEventNo
              : null,
        }
      : {}),
    ...(input.handling !== undefined
      ? { handling: typeof input.handling === 'string' ? input.handling : null }
      : {}),
    ...(input.resolution !== undefined
      ? {
          resolution:
            typeof input.resolution === 'string' ? input.resolution : null,
        }
      : {}),
    ...(input.acceptanceNote !== undefined
      ? {
          acceptanceNote:
            typeof input.acceptanceNote === 'string'
              ? input.acceptanceNote
              : null,
        }
      : {}),
  };
}

export function createServiceRouteContribution(): AppApiRouteContribution<Application> {
  return defineApiRoutes((app) => {
    const access = new ServiceAccess(app.container.resolve(authorizationToken));
    // The browser module addresses these endpoints as `/api/service/...`, so the
    // module's router is mounted under `/service` inside the API scope. Keeping
    // the paths in `createServiceRoutes` relative to that prefix is what makes
    // the two sides agree.
    const mounted = new Hono();
    mounted.route('/service', createServiceRoutes(app, { access }));
    return mounted;
  });
}

export const serviceRoutes: AppApiRouteContribution<Application> =
  createServiceRouteContribution();
