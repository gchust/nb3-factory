import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';

import {
  CrmNotFoundError,
  CrmValidationError,
  crmServiceToken,
  type ContactInput,
  type CrmService,
  type CustomerInput,
  type OpportunityInput,
} from '../providers/crm/index.js';

/**
 * HTTP surface for the CRM feature. Every path is authenticated: mounting
 * under `/api` does not authenticate anything on its own, so the middleware is
 * installed here, scoped to the `/crm` prefix this route owns.
 */
export const crmRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);

  router.use('/crm/*', auth.required());

  const service = (): CrmService => app.container.resolve(crmServiceToken);

  router.get('/crm/customers', async (context) =>
    respond(context, async () => {
      const search = context.req.query('search');
      return {
        data: await service().listCustomers({ search }),
      };
    }),
  );

  router.post('/crm/customers', async (context) =>
    respond(context, async () => {
      const body = await readJson<CustomerInput>(context);
      return { data: await service().createCustomer(body) };
    }),
  );

  router.get('/crm/customers/:id/detail', async (context) =>
    respond(context, async () => {
      const id = requireId(context.req.param('id'));
      return { data: await service().getCustomerDetail(id) };
    }),
  );

  router.get('/crm/customers/:id', async (context) =>
    respond(context, async () => {
      const id = requireId(context.req.param('id'));
      return { data: await service().getCustomer(id) };
    }),
  );

  router.patch('/crm/customers/:id', async (context) =>
    respond(context, async () => {
      const id = requireId(context.req.param('id'));
      const body = await readJson<Partial<CustomerInput>>(context);
      return { data: await service().updateCustomer(id, body) };
    }),
  );

  router.get('/crm/contacts', async (context) =>
    respond(context, async () => {
      const search = context.req.query('search');
      const customerId = parseOptionalId(
        context.req.query('customerId'),
        'customerId',
      );
      return { data: await service().listContacts({ search, customerId }) };
    }),
  );

  router.post('/crm/contacts', async (context) =>
    respond(context, async () => {
      const body = await readJson<ContactInput>(context);
      return { data: await service().createContact(body) };
    }),
  );

  router.get('/crm/contacts/:id', async (context) =>
    respond(context, async () => {
      const id = requireId(context.req.param('id'));
      return { data: await service().getContact(id) };
    }),
  );

  router.patch('/crm/contacts/:id', async (context) =>
    respond(context, async () => {
      const id = requireId(context.req.param('id'));
      const body = await readJson<Partial<ContactInput>>(context);
      return { data: await service().updateContact(id, body) };
    }),
  );

  router.get('/crm/opportunities', async (context) =>
    respond(context, async () => {
      const search = context.req.query('search');
      const stage = context.req.query('stage');
      const customerId = parseOptionalId(
        context.req.query('customerId'),
        'customerId',
      );
      return {
        data: await service().listOpportunities({ search, customerId, stage }),
      };
    }),
  );

  router.post('/crm/opportunities', async (context) =>
    respond(context, async () => {
      const body = await readJson<OpportunityInput>(context);
      return { data: await service().createOpportunity(body) };
    }),
  );

  router.get('/crm/opportunities/:id', async (context) =>
    respond(context, async () => {
      const id = requireId(context.req.param('id'));
      return { data: await service().getOpportunity(id) };
    }),
  );

  router.patch('/crm/opportunities/:id', async (context) =>
    respond(context, async () => {
      const id = requireId(context.req.param('id'));
      const body = await readJson<Partial<OpportunityInput>>(context);
      return { data: await service().updateOpportunity(id, body) };
    }),
  );

  return router;
});

export default crmRoutes;

interface DataResponse<T> {
  data: T;
}

async function respond(
  context: Context,
  handler: () => Promise<DataResponse<unknown>>,
): Promise<Response> {
  try {
    return context.json(await handler());
  } catch (error) {
    if (error instanceof CrmValidationError) {
      return context.json(
        {
          code: error.code,
          message: error.message,
          field: error.field,
        },
        400,
      );
    }

    if (error instanceof CrmNotFoundError) {
      return context.json({ code: error.code, message: error.message }, 404);
    }

    if (error instanceof SyntaxError) {
      return context.json(
        {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be valid JSON.',
        },
        400,
      );
    }

    throw error;
  }
}

async function readJson<T>(context: Context): Promise<T> {
  const body = (await context.req.json()) as unknown;

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new CrmValidationError('Request body must be a JSON object.');
  }

  return body as T;
}

function requireId(value: string | undefined): number {
  const id = parseOptionalId(value, 'id');

  if (id === undefined) {
    throw new CrmValidationError('id is required.', 'id');
  }

  return id;
}

function parseOptionalId(
  value: string | undefined,
  field: string,
): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CrmValidationError(`${field} must be a positive integer.`, field);
  }

  return parsed;
}
