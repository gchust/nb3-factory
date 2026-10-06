import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import { CrmError } from '../providers/crm/errors.js';
import { crmServiceToken } from '../providers/crm/provider.js';
import {
  isOpportunityStage,
  type ContactCreateInput,
  type ContactUpdateInput,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type OpportunityCreateInput,
  type OpportunityUpdateInput,
} from '../providers/crm/service.js';

/** Parse the JSON object body, or fail as a validation error rather than a 500. */
async function readBody(context: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new CrmError('INVALID_BODY');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CrmError('INVALID_BODY');
  }
  return body as Record<string, unknown>;
}

/** A positive integer filter value from the query string; anything else means "no filter". */
function parseQueryId(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const routes: readonly AppRouteContribution<Application>[] = [
  defineApiRoutes(({ container }) => {
    const authentication = container.resolve(authenticationToken);
    const service = container.resolve(crmServiceToken);
    const router = new Hono();
    const crm = new Hono();

    crm.onError((error, context) => {
      if (error instanceof CrmError) {
        const status =
          error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'NAME_TAKEN'
              ? 409
              : 400;
        return context.json(
          {
            code: error.code,
            message: error.message,
            ...(error.field ? { field: error.field } : {}),
          },
          status,
        );
      }
      throw error;
    });

    // The one sales team: every signed-in user may view, create and edit.
    // Mounting under /api does not authenticate, so the check is explicit here.
    crm.use('*', authentication.required());

    // Customers -----------------------------------------------------------------
    crm.get('/customers', async (context) =>
      context.json({
        data: await service.listCustomers({
          search: context.req.query('search'),
        }),
      }),
    );

    crm.post('/customers', async (context) =>
      context.json(
        {
          data: await service.createCustomer(
            (await readBody(context)) as unknown as CustomerCreateInput,
          ),
        },
        201,
      ),
    );

    crm.get('/customers/:customerId', async (context) =>
      context.json({
        data: await service.getCustomerDetail(context.req.param('customerId')),
      }),
    );

    crm.patch('/customers/:customerId', async (context) =>
      context.json({
        data: await service.updateCustomer(
          context.req.param('customerId'),
          (await readBody(context)) as unknown as CustomerUpdateInput,
        ),
      }),
    );

    // Contacts ------------------------------------------------------------------
    crm.get('/contacts', async (context) =>
      context.json({
        data: await service.listContacts({
          search: context.req.query('search'),
          customerId: parseQueryId(context.req.query('customerId')),
        }),
      }),
    );

    crm.post('/contacts', async (context) =>
      context.json(
        {
          data: await service.createContact(
            (await readBody(context)) as unknown as ContactCreateInput,
          ),
        },
        201,
      ),
    );

    crm.get('/contacts/:contactId', async (context) =>
      context.json({
        data: await service.getContact(context.req.param('contactId')),
      }),
    );

    crm.patch('/contacts/:contactId', async (context) =>
      context.json({
        data: await service.updateContact(
          context.req.param('contactId'),
          (await readBody(context)) as unknown as ContactUpdateInput,
        ),
      }),
    );

    // Opportunities -------------------------------------------------------------
    crm.get('/opportunities', async (context) => {
      const stageParam = context.req.query('stage');
      return context.json({
        data: await service.listOpportunities({
          search: context.req.query('search'),
          stage: isOpportunityStage(stageParam) ? stageParam : undefined,
          customerId: parseQueryId(context.req.query('customerId')),
        }),
      });
    });

    crm.post('/opportunities', async (context) =>
      context.json(
        {
          data: await service.createOpportunity(
            (await readBody(context)) as unknown as OpportunityCreateInput,
          ),
        },
        201,
      ),
    );

    crm.get('/opportunities/:opportunityId', async (context) =>
      context.json({
        data: await service.getOpportunity(context.req.param('opportunityId')),
      }),
    );

    crm.patch('/opportunities/:opportunityId', async (context) =>
      context.json({
        data: await service.updateOpportunity(
          context.req.param('opportunityId'),
          (await readBody(context)) as unknown as OpportunityUpdateInput,
        ),
      }),
    );

    router.route('/crm', crm);
    return router;
  }),
];

export default routes;
