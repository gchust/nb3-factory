import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { Hono, type Context } from 'hono';
import {
  CrmServiceError,
  crmServiceToken,
  type ContactInput,
  type CrmService,
  type CustomerInput,
  type ListContactOptions,
  type ListOpportunityOptions,
  type OpportunityInput,
  type OpportunityStage,
} from '../providers/crm.js';

export interface CreateCrmRoutesOptions {
  readonly auth: Pick<Auth, 'required'>;
  readonly crm: CrmService;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBody(context: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return isPlainObject(body) ? body : {};
  } catch {
    throw new CrmServiceError('VALIDATION', 'Request body must be valid JSON.');
  }
}

function pathId(context: Context): number {
  const raw = context.req.param('id');
  return Number.parseInt(raw ?? '', 10);
}

function optionalStage(context: Context): OpportunityStage | undefined {
  const raw = context.req.query('stage');
  return raw && raw.length > 0 ? (raw as OpportunityStage) : undefined;
}

function optionalCustomerId(context: Context): number | undefined {
  const raw = context.req.query('customerId');
  if (!raw || raw.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function optionalSearch(context: Context): string | undefined {
  const raw = context.req.query('search');
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

function errorResponse(context: Context, error: unknown): Response {
  if (error instanceof CrmServiceError) {
    const status = error.code === 'NOT_FOUND' ? 404 : 422;
    return context.json(
      { code: error.code, message: error.message, field: error.field },
      status,
    );
  }

  throw error;
}

async function respond<T>(
  context: Context,
  operation: () => Promise<T>,
  status: 200 | 201 = 200,
): Promise<Response> {
  try {
    return context.json({ data: await operation() }, status);
  } catch (error) {
    return errorResponse(context, error);
  }
}

/**
 * CRM endpoints, mounted under `/api` by the runtime.
 *
 * Authentication is installed on each route rather than with `use('*')`, so
 * the middleware covers exactly the paths this contribution owns and cannot
 * shadow unrelated `/api/*` paths that should fall through to the SPA.
 */
export function createCrmRoutes(options: CreateCrmRoutesOptions): Hono {
  const routes = new Hono();
  const { crm } = options;
  const requireAuth = options.auth.required();

  routes.get('/customers', requireAuth, async (context) =>
    respond(context, () =>
      crm.listCustomers({ search: optionalSearch(context) }),
    ),
  );

  routes.get('/customers/:id', requireAuth, async (context) =>
    respond(context, () => crm.getCustomer(pathId(context))),
  );

  routes.post('/customers', requireAuth, async (context) =>
    respond(
      context,
      async () => {
        const body = await readBody(context);
        return crm.createCustomer({
          name: body.name as string,
          industry: body.industry as string | null | undefined,
        } satisfies CustomerInput);
      },
      201,
    ),
  );

  routes.patch('/customers/:id', requireAuth, async (context) =>
    respond(context, async () => {
      const body = await readBody(context);
      return crm.updateCustomer(pathId(context), {
        name: body.name as string,
        industry: body.industry as string | null | undefined,
      } satisfies CustomerInput);
    }),
  );

  routes.get('/contacts', requireAuth, async (context) =>
    respond(context, () =>
      crm.listContacts({
        search: optionalSearch(context),
        customerId: optionalCustomerId(context),
      } satisfies ListContactOptions),
    ),
  );

  routes.get('/contacts/:id', requireAuth, async (context) =>
    respond(context, () => crm.getContact(pathId(context))),
  );

  routes.post('/contacts', requireAuth, async (context) =>
    respond(
      context,
      async () => {
        const body = await readBody(context);
        return crm.createContact({
          name: body.name as string,
          phone: body.phone as string | null | undefined,
          email: body.email as string | null | undefined,
          customerId: body.customerId as number,
        } satisfies ContactInput);
      },
      201,
    ),
  );

  routes.patch('/contacts/:id', requireAuth, async (context) =>
    respond(context, async () => {
      const body = await readBody(context);
      return crm.updateContact(pathId(context), {
        name: body.name as string,
        phone: body.phone as string | null | undefined,
        email: body.email as string | null | undefined,
        customerId: body.customerId as number,
      } satisfies ContactInput);
    }),
  );

  routes.get('/opportunities', requireAuth, async (context) =>
    respond(context, () =>
      crm.listOpportunities({
        search: optionalSearch(context),
        stage: optionalStage(context),
        customerId: optionalCustomerId(context),
      } satisfies ListOpportunityOptions),
    ),
  );

  routes.get('/opportunities/:id', requireAuth, async (context) =>
    respond(context, () => crm.getOpportunity(pathId(context))),
  );

  routes.post('/opportunities', requireAuth, async (context) =>
    respond(
      context,
      async () => {
        const body = await readBody(context);
        return crm.createOpportunity({
          name: body.name as string,
          customerId: body.customerId as number,
          amount: body.amount as number,
          stage: body.stage as OpportunityStage,
        } satisfies OpportunityInput);
      },
      201,
    ),
  );

  routes.patch('/opportunities/:id', requireAuth, async (context) =>
    respond(context, async () => {
      const body = await readBody(context);
      return crm.updateOpportunity(pathId(context), {
        name: body.name as string,
        customerId: body.customerId as number,
        amount: body.amount as number,
        stage: body.stage as OpportunityStage,
      } satisfies OpportunityInput);
    }),
  );

  return routes;
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const auth = app.container.resolve(authenticationToken);
    const crm = app.container.resolve(crmServiceToken);
    return createCrmRoutes({ auth, crm });
  },
);
