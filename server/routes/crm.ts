import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  CrmNotFoundError,
  CrmValidationError,
  OPPORTUNITY_STAGES,
  crmServiceToken,
  type CrmService,
  type OpportunityStage,
} from '../providers/crm.js';

/**
 * Application-owned CRM API. Mounted under `/api`, so every path here omits
 * that prefix; each one authenticates the caller itself through
 * `auth.required()` and trusts no middleware from a sibling route.
 */
export function createCrmApiRouter(app: Application): Hono {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const crm = app.container.resolve(crmServiceToken);

  router.use('/crm/*', auth.required());

  router.get('/crm/customers', async (context) =>
    context.json({ data: await crm.listCustomers() }),
  );

  router.post('/crm/customers', async (context) =>
    context.json(
      { data: await crm.createCustomer(await readJson(context)) },
      201,
    ),
  );

  router.get('/crm/customers/:id', async (context) => {
    const id = readIdParam(context);
    const customer = await crm.getCustomer(id);
    if (!customer) {
      return notFound(context, 'CUSTOMER_NOT_FOUND');
    }
    return context.json({ data: customer });
  });

  router.patch('/crm/customers/:id', async (context) => {
    const id = readIdParam(context);
    const customer = await crm.updateCustomer(id, await readJson(context));
    if (!customer) {
      return notFound(context, 'CUSTOMER_NOT_FOUND');
    }
    return context.json({ data: customer });
  });

  router.get('/crm/contacts', async (context) => {
    const customerId = readOptionalIdQuery(context, 'customerId');
    return context.json({ data: await crm.listContacts(customerId) });
  });

  router.get('/crm/contacts/:id', async (context) => {
    const id = readIdParam(context);
    const contact = await crm.getContact(id);
    if (!contact) {
      return notFound(context, 'CONTACT_NOT_FOUND');
    }
    return context.json({ data: contact });
  });

  router.post('/crm/contacts', async (context) =>
    context.json(
      { data: await crm.createContact(await readJson(context)) },
      201,
    ),
  );

  router.patch('/crm/contacts/:id', async (context) => {
    const id = readIdParam(context);
    const contact = await crm.updateContact(id, await readJson(context));
    if (!contact) {
      return notFound(context, 'CONTACT_NOT_FOUND');
    }
    return context.json({ data: contact });
  });

  router.get('/crm/opportunities', async (context) => {
    const stage = readOptionalStage(context);
    const customerId = readOptionalIdQuery(context, 'customerId');
    return context.json({
      data: await crm.listOpportunities({ stage, customerId }),
    });
  });

  router.get('/crm/opportunities/:id', async (context) => {
    const id = readIdParam(context);
    const opportunity = await crm.getOpportunity(id);
    if (!opportunity) {
      return notFound(context, 'OPPORTUNITY_NOT_FOUND');
    }
    return context.json({ data: opportunity });
  });

  router.post('/crm/opportunities', async (context) =>
    context.json(
      { data: await crm.createOpportunity(await readJson(context)) },
      201,
    ),
  );

  router.patch('/crm/opportunities/:id', async (context) => {
    const id = readIdParam(context);
    const opportunity = await crm.updateOpportunity(
      id,
      await readJson(context),
    );
    if (!opportunity) {
      return notFound(context, 'OPPORTUNITY_NOT_FOUND');
    }
    return context.json({ data: opportunity });
  });

  router.onError((error, context) => handleCrmError(context, error));

  return router;
}

export const crmApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => createCrmApiRouter(app));

function handleCrmError(context: Context, error: unknown): Response {
  if (error instanceof CrmValidationError) {
    return context.json({ code: error.code, message: error.message }, 400);
  }
  if (error instanceof CrmNotFoundError) {
    return context.json({ code: error.code, message: error.message }, 404);
  }
  throw error;
}

function notFound(context: Context, code: string): Response {
  return context.json({ code, message: 'Record not found.' }, 404);
}

async function readJson(context: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new CrmValidationError(
      'INVALID_BODY',
      'Request body must be a JSON object.',
    );
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CrmValidationError(
      'INVALID_BODY',
      'Request body must be a JSON object.',
    );
  }
  return body as Record<string, unknown>;
}

function readIdParam(context: Context): number {
  const raw = context.req.param('id');
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new CrmValidationError(
      'INVALID_ID',
      'id must be a positive integer.',
    );
  }
  return id;
}

function readOptionalIdQuery(
  context: Context,
  name: string,
): number | undefined {
  const raw = context.req.query(name);
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new CrmValidationError(
      'INVALID_QUERY',
      `${name} must be a positive integer.`,
    );
  }
  return id;
}

function readOptionalStage(context: Context): OpportunityStage | undefined {
  const raw = context.req.query('stage');
  if (raw === undefined || raw === '') {
    return undefined;
  }
  if (!(OPPORTUNITY_STAGES as readonly string[]).includes(raw)) {
    throw new CrmValidationError(
      'OPPORTUNITY_STAGE_INVALID',
      `stage must be one of ${OPPORTUNITY_STAGES.join(', ')}.`,
    );
  }
  return raw as OpportunityStage;
}

export type { CrmService };
