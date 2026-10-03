import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { Hono, type Context } from 'hono';

import {
  CrmNotFoundError,
  CrmValidationError,
  crmServiceToken,
  type CrmService,
  type ListQuery,
} from '../providers/crm.js';

function toId(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

async function readJson(context: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return {};
    }
    return body as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Customer, contact and opportunity endpoints.
 *
 * Security is owned here: every path below is behind `auth.required()`, and
 * the list and detail responses are built from the same service methods, so a
 * customer's amount total can only ever count its own opportunities.
 */
export const apiRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const crm = (): CrmService => app.container.resolve(crmServiceToken);

  // Authentication is attached to each path this contribution owns rather than a `router.use('*', ...)` wildcard:
  // the router mounts under the application's `/api` prefix, and a wildcard here would intercept every unmatched
  // `/api/*` request before the SPA fallback could answer it.
  const requireUser = auth.required();

  function handleError(error: Error, context: Context) {
    if (error instanceof CrmValidationError) {
      return context.json(
        {
          error: {
            code: error.code,
            message: error.message,
            field: error.field,
          },
        },
        400,
      );
    }
    if (error instanceof CrmNotFoundError) {
      return context.json(
        { error: { code: error.code, message: error.message } },
        404,
      );
    }
    throw error;
  }

  // --- Customers ---------------------------------------------------------

  router.get('/customers', requireUser, async (context) => {
    const search = context.req.query('search');
    const query: ListQuery = search ? { search } : {};
    return context.json({ data: await crm().listCustomers(query) });
  });

  router.post('/customers', requireUser, async (context) => {
    const body = await readJson(context);
    return context.json({ data: await crm().createCustomer(body) }, 201);
  });

  router.get('/customers/:id', requireUser, async (context) => {
    const id = toId(context.req.param('id'));
    const detail = id === undefined ? undefined : await crm().getCustomer(id);
    if (!detail) {
      return context.json(
        {
          error: { code: 'CRM_NOT_FOUND', message: 'Customer was not found.' },
        },
        404,
      );
    }
    return context.json({ data: detail });
  });

  router.patch('/customers/:id', requireUser, async (context) => {
    const id = toId(context.req.param('id'));
    if (id === undefined) {
      return context.json(
        {
          error: { code: 'CRM_NOT_FOUND', message: 'Customer was not found.' },
        },
        404,
      );
    }
    const body = await readJson(context);
    return context.json({ data: await crm().updateCustomer(id, body) });
  });

  // --- Contacts ----------------------------------------------------------

  router.get('/contacts', requireUser, async (context) => {
    const customerId = toId(context.req.query('customerId'));
    const search = context.req.query('search');
    const query: ListQuery = {
      ...(customerId === undefined ? {} : { customerId }),
      ...(search ? { search } : {}),
    };
    return context.json({ data: await crm().listContacts(query) });
  });

  router.get('/contacts/:id', requireUser, async (context) => {
    const id = toId(context.req.param('id'));
    const contact = id === undefined ? undefined : await crm().getContact(id);
    if (!contact) {
      return context.json(
        { error: { code: 'CRM_NOT_FOUND', message: 'Contact was not found.' } },
        404,
      );
    }
    return context.json({ data: contact });
  });

  router.post('/contacts', requireUser, async (context) => {
    const body = await readJson(context);
    return context.json({ data: await crm().createContact(body) }, 201);
  });

  router.patch('/contacts/:id', requireUser, async (context) => {
    const id = toId(context.req.param('id'));
    if (id === undefined) {
      return context.json(
        { error: { code: 'CRM_NOT_FOUND', message: 'Contact was not found.' } },
        404,
      );
    }
    const body = await readJson(context);
    return context.json({ data: await crm().updateContact(id, body) });
  });

  // --- Opportunities -----------------------------------------------------

  router.get('/opportunities', requireUser, async (context) => {
    const customerId = toId(context.req.query('customerId'));
    const search = context.req.query('search');
    const stage = context.req.query('stage');
    const query: ListQuery = {
      ...(customerId === undefined ? {} : { customerId }),
      ...(search ? { search } : {}),
      ...(stage ? { stage } : {}),
    };
    return context.json({ data: await crm().listOpportunities(query) });
  });

  router.get('/opportunities/:id', requireUser, async (context) => {
    const id = toId(context.req.param('id'));
    const opportunity =
      id === undefined ? undefined : await crm().getOpportunity(id);
    if (!opportunity) {
      return context.json(
        {
          error: {
            code: 'CRM_NOT_FOUND',
            message: 'Opportunity was not found.',
          },
        },
        404,
      );
    }
    return context.json({ data: opportunity });
  });

  router.post('/opportunities', requireUser, async (context) => {
    const body = await readJson(context);
    return context.json({ data: await crm().createOpportunity(body) }, 201);
  });

  router.patch('/opportunities/:id', requireUser, async (context) => {
    const id = toId(context.req.param('id'));
    if (id === undefined) {
      return context.json(
        {
          error: {
            code: 'CRM_NOT_FOUND',
            message: 'Opportunity was not found.',
          },
        },
        404,
      );
    }
    const body = await readJson(context);
    return context.json({ data: await crm().updateOpportunity(id, body) });
  });

  router.onError(handleError);

  return router;
});

export default apiRoutes;
