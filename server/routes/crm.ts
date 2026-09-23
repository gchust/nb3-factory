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
  crmServiceToken,
  isOpportunityStage,
} from '../providers/crm.js';

/**
 * The CRM HTTP surface. Every path is mounted on an isolated sub-router that installs
 * `auth.required()` for itself, so the endpoints stay protected no matter what other route
 * contributions are registered before or after this one.
 *
 * There is a single ordinary usage mode for this application, so authentication is the whole
 * access boundary here: a signed-in user may read and write the CRM records. If role-based
 * access is introduced later, add `authorization.middleware()` and a per-operation check.
 */
export const crmApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const crm = app.container.resolve(crmServiceToken);

    const routes = new Hono();

    routes.onError((error, context) => {
      if (error instanceof CrmValidationError) {
        return context.json({ code: error.code, message: error.message }, 400);
      }
      if (error instanceof CrmNotFoundError) {
        return context.json({ code: error.code, message: error.message }, 404);
      }
      throw error;
    });

    routes.use('*', auth.required());

    routes.get('/customers', async (context) =>
      context.json({ data: await crm.listCustomers() }),
    );

    routes.post('/customers', async (context) => {
      const input = await readJson(context);
      return context.json({ data: await crm.createCustomer(input) }, 201);
    });

    routes.get('/customers/:id', async (context) => {
      const detail = await crm.getCustomer(readId(context.req.param('id')));
      if (!detail) throw new CrmNotFoundError('Customer not found.');
      return context.json({ data: detail });
    });

    routes.patch('/customers/:id', async (context) => {
      const input = await readJson(context);
      return context.json({
        data: await crm.updateCustomer(readId(context.req.param('id')), input),
      });
    });

    routes.get('/contacts', async (context) =>
      context.json({ data: await crm.listContacts() }),
    );

    routes.post('/contacts', async (context) => {
      const input = await readJson(context);
      return context.json({ data: await crm.createContact(input) }, 201);
    });

    routes.patch('/contacts/:id', async (context) => {
      const input = await readJson(context);
      return context.json({
        data: await crm.updateContact(readId(context.req.param('id')), input),
      });
    });

    routes.get('/opportunities', async (context) => {
      const stage = context.req.query('stage');
      if (stage !== undefined && !isOpportunityStage(stage)) {
        throw new CrmValidationError(
          'stage must be one of: following, won, lost.',
        );
      }
      return context.json({
        data: await crm.listOpportunities(
          stage === undefined ? undefined : stage,
        ),
      });
    });

    routes.post('/opportunities', async (context) => {
      const input = await readJson(context);
      return context.json({ data: await crm.createOpportunity(input) }, 201);
    });

    routes.patch('/opportunities/:id', async (context) => {
      const input = await readJson(context);
      return context.json({
        data: await crm.updateOpportunity(
          readId(context.req.param('id')),
          input,
        ),
      });
    });

    router.route('/crm', routes);
    return router;
  });

async function readJson(context: Context): Promise<Record<string, unknown>> {
  const body: unknown = await context.req.json().catch(() => null);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new CrmValidationError('Request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

function readId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new CrmNotFoundError('Record not found.');
  }
  return id;
}
