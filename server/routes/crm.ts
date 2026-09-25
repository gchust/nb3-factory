import { Hono, type Context } from 'hono';

import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';

import {
  CrmNotFoundError,
  CrmValidationError,
  crmServiceToken,
  type OpportunityStage,
} from '../providers/crm.js';

async function readJsonBody(
  context: Context,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new CrmValidationError('body', 'Request body must be an object.');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof CrmValidationError) {
      throw error;
    }
    throw new CrmValidationError('body', 'Request body must be valid JSON.');
  }
}

function readOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readOptionalId(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function readStage(value: string | undefined): OpportunityStage | undefined {
  if (value === 'following' || value === 'won' || value === 'lost') {
    return value;
  }
  return undefined;
}

/**
 * The CRM feature runs in a single ordinary usage mode: any signed-in user may
 * read and write every record. Authentication is therefore the only guard these
 * routes install, and the service layer is the sole owner of input validation.
 */
export const crmApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const crm = app.container.resolve(crmServiceToken);

    router.onError((error, context) => {
      if (error instanceof CrmNotFoundError) {
        return context.json({ message: error.message, code: error.code }, 404);
      }
      if (error instanceof CrmValidationError) {
        return context.json(
          { message: error.message, code: error.code, field: error.field },
          400,
        );
      }
      throw error;
    });

    router.use('/crm/*', auth.required());

    router.get('/crm/customers', async (context) => {
      const search = readOptionalString(context.req.query('search'));
      return context.json({ data: await crm.listCustomers(search) });
    });

    router.post('/crm/customers', async (context) => {
      const body = await readJsonBody(context);
      return context.json({ data: await crm.createCustomer(body) }, 201);
    });

    router.get('/crm/customers/:id', async (context) => {
      const id = Number(context.req.param('id'));
      return context.json({ data: await crm.getCustomerDetail(id) });
    });

    router.patch('/crm/customers/:id', async (context) => {
      const id = Number(context.req.param('id'));
      const body = await readJsonBody(context);
      return context.json({ data: await crm.updateCustomer(id, body) });
    });

    router.get('/crm/contacts', async (context) => {
      return context.json({
        data: await crm.listContacts({
          customerId: readOptionalId(context.req.query('customerId')),
          search: readOptionalString(context.req.query('search')),
        }),
      });
    });

    router.post('/crm/contacts', async (context) => {
      const body = await readJsonBody(context);
      return context.json({ data: await crm.createContact(body) }, 201);
    });

    router.get('/crm/contacts/:id', async (context) => {
      const id = Number(context.req.param('id'));
      return context.json({ data: await crm.getContact(id) });
    });

    router.patch('/crm/contacts/:id', async (context) => {
      const id = Number(context.req.param('id'));
      const body = await readJsonBody(context);
      return context.json({ data: await crm.updateContact(id, body) });
    });

    router.get('/crm/opportunities', async (context) => {
      return context.json({
        data: await crm.listOpportunities({
          customerId: readOptionalId(context.req.query('customerId')),
          stage: readStage(context.req.query('stage')),
          search: readOptionalString(context.req.query('search')),
        }),
      });
    });

    router.post('/crm/opportunities', async (context) => {
      const body = await readJsonBody(context);
      return context.json({ data: await crm.createOpportunity(body) }, 201);
    });

    router.get('/crm/opportunities/:id', async (context) => {
      const id = Number(context.req.param('id'));
      return context.json({ data: await crm.getOpportunity(id) });
    });

    router.patch('/crm/opportunities/:id', async (context) => {
      const id = Number(context.req.param('id'));
      const body = await readJsonBody(context);
      return context.json({ data: await crm.updateOpportunity(id, body) });
    });

    return router;
  });

export default crmApiRoutes;
