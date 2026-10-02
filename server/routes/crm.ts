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
  type ContactListInput,
  type OpportunityListInput,
} from '../providers/crm.js';

type CrmContext = Context;

/** Map a domain error to its HTTP response; anything else is rethrown for the global error handler. */
function failure(context: CrmContext, error: unknown): Response {
  if (error instanceof CrmValidationError) {
    return context.json(
      { code: error.code, field: error.field, message: error.message },
      400,
    );
  }
  if (error instanceof CrmNotFoundError) {
    return context.json({ code: error.code, message: error.message }, 404);
  }
  throw error;
}

async function readBody(context: CrmContext): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseOptionalId(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

export const crmApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const crm = app.container.resolve(crmServiceToken);

    // Every path this contribution owns requires a signed-in session. The patterns are scoped to the three prefixes
    // so the middleware never leaks into routes mounted by another contribution.
    router.use('/customers/*', auth.required());
    router.use('/contacts/*', auth.required());
    router.use('/opportunities/*', auth.required());

    router.get('/customers', async (context) => {
      try {
        return context.json({ data: await crm.listCustomers() });
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    router.post('/customers', async (context) => {
      try {
        const body = await readBody(context);
        return context.json(
          { data: await crm.createCustomer(body as never) },
          201,
        );
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    router.get('/customers/:id', async (context) => {
      try {
        return context.json({
          data: await crm.getCustomer(Number(context.req.param('id'))),
        });
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    router.patch('/customers/:id', async (context) => {
      try {
        const body = await readBody(context);
        return context.json({
          data: await crm.updateCustomer(
            Number(context.req.param('id')),
            body as never,
          ),
        });
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    router.get('/contacts', async (context) => {
      try {
        const parsedCustomerId = parseOptionalId(
          context.req.query('customerId'),
        );
        const input: ContactListInput = {
          customerId: Number.isNaN(parsedCustomerId)
            ? undefined
            : parsedCustomerId,
        };
        return context.json({ data: await crm.listContacts(input) });
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    router.post('/contacts', async (context) => {
      try {
        const body = await readBody(context);
        return context.json(
          { data: await crm.createContact(body as never) },
          201,
        );
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    router.patch('/contacts/:id', async (context) => {
      try {
        const body = await readBody(context);
        return context.json({
          data: await crm.updateContact(
            Number(context.req.param('id')),
            body as never,
          ),
        });
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    router.get('/opportunities', async (context) => {
      try {
        const stage = context.req.query('stage');
        const parsedCustomerId = parseOptionalId(
          context.req.query('customerId'),
        );
        const input: OpportunityListInput = {
          customerId: Number.isNaN(parsedCustomerId)
            ? undefined
            : parsedCustomerId,
          stage:
            stage === undefined || stage === '' ? undefined : (stage as never),
        };
        return context.json({ data: await crm.listOpportunities(input) });
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    router.post('/opportunities', async (context) => {
      try {
        const body = await readBody(context);
        return context.json(
          { data: await crm.createOpportunity(body as never) },
          201,
        );
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    router.patch('/opportunities/:id', async (context) => {
      try {
        const body = await readBody(context);
        return context.json({
          data: await crm.updateOpportunity(
            Number(context.req.param('id')),
            body as never,
          ),
        });
      } catch (error: unknown) {
        return failure(context, error);
      }
    });

    return router;
  });

export default crmApiRoutes;
