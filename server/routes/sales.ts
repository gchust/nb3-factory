import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import type { ZodError } from 'zod';

import {
  OPPORTUNITY_STAGES,
  salesServiceToken,
  type OpportunityStage,
  type SalesService,
} from '../providers/sales-service.js';
import {
  contactInputSchema,
  contactUpdateSchema,
  customerInputSchema,
  customerUpdateSchema,
  opportunityInputSchema,
  opportunityUpdateSchema,
  validationErrorBody,
} from './sales-schema.js';

/** Read a JSON body, answering `undefined` for a malformed or empty one. */
async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function badRequest(context: Context, error: ZodError): Response {
  return context.json(validationErrorBody(error), 400);
}

function missing(context: Context, what: string): Response {
  return context.json({ code: 'NOT_FOUND', message: `${what} not found` }, 404);
}

function fieldError(
  context: Context,
  field: string,
  message: string,
): Response {
  return context.json(
    {
      code: 'VALIDATION_ERROR',
      message,
      errors: [{ path: [field], message }],
    },
    400,
  );
}

/** Parse one path parameter as a positive integer, or `undefined` when it is not one. */
function parseId(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseCustomerIdQuery(context: Context): number | undefined | null {
  const raw = context.req.query('customerId');
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const parsed = parseId(raw);
  return parsed ?? null;
}

function parseStageQuery(
  context: Context,
): OpportunityStage | undefined | null {
  const raw = context.req.query('stage');
  if (raw === undefined || raw === '') {
    return undefined;
  }
  return OPPORTUNITY_STAGES.includes(raw as OpportunityStage)
    ? (raw as OpportunityStage)
    : null;
}

export interface SalesRoutesOptions {
  readonly auth: Auth;
  readonly service: SalesService;
}

/**
 * The customer endpoints. Each router owns its authentication middleware and is
 * mounted under its own prefix, so nothing here can protect or expose a route
 * that belongs to another contribution.
 */
function createCustomerRoutes(options: SalesRoutesOptions): Hono {
  const { auth, service } = options;
  const routes = new Hono();
  routes.use('*', auth.required());

  routes.get('/', async (context) =>
    context.json({ data: await service.listCustomers() }),
  );

  routes.post('/', async (context) => {
    const parsed = customerInputSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return badRequest(context, parsed.error);
    }
    return context.json(
      { data: await service.createCustomer(parsed.data) },
      201,
    );
  });

  routes.get('/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    const detail =
      id === undefined ? undefined : await service.getCustomerDetail(id);
    return detail
      ? context.json({ data: detail })
      : missing(context, 'Customer');
  });

  routes.patch('/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    if (id === undefined) {
      return missing(context, 'Customer');
    }
    const parsed = customerUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return badRequest(context, parsed.error);
    }
    const updated = await service.updateCustomer(id, parsed.data);
    return updated
      ? context.json({ data: updated })
      : missing(context, 'Customer');
  });

  return routes;
}

function createContactRoutes(options: SalesRoutesOptions): Hono {
  const { auth, service } = options;
  const routes = new Hono();
  routes.use('*', auth.required());

  routes.get('/', async (context) => {
    const customerId = parseCustomerIdQuery(context);
    if (customerId === null) {
      return fieldError(
        context,
        'customerId',
        'customerId must be a positive integer',
      );
    }
    return context.json({
      data: await service.listContacts(
        customerId === undefined ? undefined : { customerId },
      ),
    });
  });

  routes.post('/', async (context) => {
    const parsed = contactInputSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return badRequest(context, parsed.error);
    }
    const customer = await service.getCustomer(parsed.data.customerId);
    if (!customer) {
      return fieldError(
        context,
        'customerId',
        'The selected customer does not exist',
      );
    }
    return context.json(
      { data: await service.createContact(parsed.data) },
      201,
    );
  });

  routes.get('/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    const contact = id === undefined ? undefined : await service.getContact(id);
    return contact
      ? context.json({ data: contact })
      : missing(context, 'Contact');
  });

  routes.patch('/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    if (id === undefined) {
      return missing(context, 'Contact');
    }
    const parsed = contactUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return badRequest(context, parsed.error);
    }
    if (parsed.data.customerId !== undefined) {
      const customer = await service.getCustomer(parsed.data.customerId);
      if (!customer) {
        return fieldError(
          context,
          'customerId',
          'The selected customer does not exist',
        );
      }
    }
    const updated = await service.updateContact(id, parsed.data);
    return updated
      ? context.json({ data: updated })
      : missing(context, 'Contact');
  });

  return routes;
}

function createOpportunityRoutes(options: SalesRoutesOptions): Hono {
  const { auth, service } = options;
  const routes = new Hono();
  routes.use('*', auth.required());

  routes.get('/', async (context) => {
    const customerId = parseCustomerIdQuery(context);
    if (customerId === null) {
      return fieldError(
        context,
        'customerId',
        'customerId must be a positive integer',
      );
    }
    const stage = parseStageQuery(context);
    if (stage === null) {
      return fieldError(
        context,
        'stage',
        `stage must be one of ${OPPORTUNITY_STAGES.join(', ')}`,
      );
    }
    const filter: { customerId?: number; stage?: OpportunityStage } = {};
    if (customerId !== undefined) {
      filter.customerId = customerId;
    }
    if (stage !== undefined) {
      filter.stage = stage;
    }
    return context.json({
      data: await service.listOpportunities(
        Object.keys(filter).length > 0 ? filter : undefined,
      ),
    });
  });

  routes.post('/', async (context) => {
    const parsed = opportunityInputSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return badRequest(context, parsed.error);
    }
    const customer = await service.getCustomer(parsed.data.customerId);
    if (!customer) {
      return fieldError(
        context,
        'customerId',
        'The selected customer does not exist',
      );
    }
    return context.json(
      { data: await service.createOpportunity(parsed.data) },
      201,
    );
  });

  routes.get('/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    const opportunity =
      id === undefined ? undefined : await service.getOpportunity(id);
    return opportunity
      ? context.json({ data: opportunity })
      : missing(context, 'Opportunity');
  });

  routes.patch('/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    if (id === undefined) {
      return missing(context, 'Opportunity');
    }
    const parsed = opportunityUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      return badRequest(context, parsed.error);
    }
    if (parsed.data.customerId !== undefined) {
      const customer = await service.getCustomer(parsed.data.customerId);
      if (!customer) {
        return fieldError(
          context,
          'customerId',
          'The selected customer does not exist',
        );
      }
    }
    const updated = await service.updateOpportunity(id, parsed.data);
    return updated
      ? context.json({ data: updated })
      : missing(context, 'Opportunity');
  });

  return routes;
}

/** The customer, contact and opportunity routers, mounted under their own prefixes. */
export function createSalesRoutes(options: SalesRoutesOptions): Hono {
  const router = new Hono();
  router.route('/customers', createCustomerRoutes(options));
  router.route('/contacts', createContactRoutes(options));
  router.route('/opportunities', createOpportunityRoutes(options));
  return router;
}

export const salesApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) =>
    createSalesRoutes({
      auth: app.container.resolve(authenticationToken),
      service: app.container.resolve(salesServiceToken),
    }),
  );
