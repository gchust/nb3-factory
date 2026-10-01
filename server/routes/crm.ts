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
  CrmNotFoundError,
  CrmValidationError,
  crmServiceToken,
  isOpportunityStage,
  type CrmService,
} from '../providers/crm.js';

/** Read an integer record id from the path or return `undefined`. */
function readId(context: Context): number | undefined {
  const id = Number(context.req.param('id'));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** Read an integer query parameter, treating a blank value as absent. */
function readOptionalQueryId(
  context: Context,
  name: string,
): number | undefined {
  const raw = context.req.query(name);
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CrmValidationError({ [name]: 'INVALID' });
  }
  return value;
}

async function readJsonBody(
  context: Context,
): Promise<Record<string, unknown>> {
  try {
    const body = await context.req.json<unknown>();
    return body !== null && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    throw new CrmValidationError({}, 'The request body must be JSON.');
  }
}

function toErrorResponse(context: Context, error: unknown) {
  if (error instanceof CrmValidationError) {
    return context.json(
      { code: error.code, message: error.message, fields: error.fields },
      400,
    );
  }
  if (error instanceof CrmNotFoundError) {
    return context.json({ code: error.code, message: error.message }, 404);
  }
  throw error;
}

const NOT_FOUND_RESPONSE = {
  code: 'NOT_FOUND',
  message: 'The requested record does not exist.',
} as const;

export function createCrmRoutes(options: {
  service: CrmService;
  auth: Auth;
}): Hono {
  const { service } = options;
  const routes = new Hono();

  // Scoped to `/crm/*` so this middleware cannot leak into a route another
  // contribution mounts after this one.
  routes.use('/crm/*', options.auth.required());

  routes.get('/crm/customers', async (context) => {
    return context.json({ data: await service.listCustomers() });
  });

  routes.post('/crm/customers', async (context) => {
    try {
      const body = await readJsonBody(context);
      return context.json({ data: await service.createCustomer(body) }, 201);
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  routes.get('/crm/customers/:id', async (context) => {
    const id = readId(context);
    const customer =
      id === undefined ? undefined : await service.getCustomer(id);
    if (!customer) {
      return context.json(NOT_FOUND_RESPONSE, 404);
    }
    return context.json({ data: customer });
  });

  routes.patch('/crm/customers/:id', async (context) => {
    const id = readId(context);
    if (id === undefined) {
      return context.json(NOT_FOUND_RESPONSE, 404);
    }
    try {
      const body = await readJsonBody(context);
      return context.json({ data: await service.updateCustomer(id, body) });
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  routes.get('/crm/customers/:id/summary', async (context) => {
    const id = readId(context);
    const summary =
      id === undefined ? undefined : await service.getCustomerSummary(id);
    if (!summary) {
      return context.json(NOT_FOUND_RESPONSE, 404);
    }
    return context.json({ data: summary });
  });

  routes.get('/crm/contacts', async (context) => {
    try {
      const customerId = readOptionalQueryId(context, 'customerId');
      return context.json({
        data: await service.listContacts({ customerId }),
      });
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  routes.post('/crm/contacts', async (context) => {
    try {
      const body = await readJsonBody(context);
      return context.json({ data: await service.createContact(body) }, 201);
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  routes.get('/crm/contacts/:id', async (context) => {
    const id = readId(context);
    const contact = id === undefined ? undefined : await service.getContact(id);
    if (!contact) {
      return context.json(NOT_FOUND_RESPONSE, 404);
    }
    return context.json({ data: contact });
  });

  routes.patch('/crm/contacts/:id', async (context) => {
    const id = readId(context);
    if (id === undefined) {
      return context.json(NOT_FOUND_RESPONSE, 404);
    }
    try {
      const body = await readJsonBody(context);
      return context.json({ data: await service.updateContact(id, body) });
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  routes.get('/crm/opportunities', async (context) => {
    try {
      const customerId = readOptionalQueryId(context, 'customerId');
      const stage = context.req.query('stage');
      if (
        stage !== undefined &&
        stage.trim() !== '' &&
        !isOpportunityStage(stage)
      ) {
        throw new CrmValidationError({ stage: 'INVALID' });
      }
      return context.json({
        data: await service.listOpportunities({
          customerId,
          stage: isOpportunityStage(stage) ? stage : undefined,
        }),
      });
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  routes.post('/crm/opportunities', async (context) => {
    try {
      const body = await readJsonBody(context);
      return context.json({ data: await service.createOpportunity(body) }, 201);
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  routes.get('/crm/opportunities/:id', async (context) => {
    const id = readId(context);
    const opportunity =
      id === undefined ? undefined : await service.getOpportunity(id);
    if (!opportunity) {
      return context.json(NOT_FOUND_RESPONSE, 404);
    }
    return context.json({ data: opportunity });
  });

  routes.patch('/crm/opportunities/:id', async (context) => {
    const id = readId(context);
    if (id === undefined) {
      return context.json(NOT_FOUND_RESPONSE, 404);
    }
    try {
      const body = await readJsonBody(context);
      return context.json({ data: await service.updateOpportunity(id, body) });
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  return routes;
}

export const crmApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(crmServiceToken);
    return createCrmRoutes({ service, auth });
  });
