import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { getRequestTranslator } from '@nocobase/i18n/server';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  isOpportunityStage,
  SalesError,
  salesServiceToken,
  type SalesService,
} from '../providers/sales.js';

/**
 * How the route renders each domain failure: the locale key for its message and the HTTP status it answers with.
 * The status lives here, not on `SalesError`, so the service stays free of HTTP concerns.
 */
const SALES_ERRORS: Readonly<
  Record<
    string,
    { readonly key: string; readonly status: ContentfulStatusCode }
  >
> = {
  CUSTOMER_NAME_REQUIRED: {
    key: 'sales.errors.customerNameRequired',
    status: 400,
  },
  CUSTOMER_NOT_FOUND: { key: 'sales.errors.customerNotFound', status: 404 },
  CUSTOMER_HAS_RELATED_RECORDS: {
    key: 'sales.errors.customerHasRelatedRecords',
    status: 409,
  },
  CONTACT_NAME_REQUIRED: {
    key: 'sales.errors.contactNameRequired',
    status: 400,
  },
  CONTACT_CUSTOMER_REQUIRED: {
    key: 'sales.errors.contactCustomerRequired',
    status: 400,
  },
  CONTACT_NOT_FOUND: { key: 'sales.errors.contactNotFound', status: 404 },
  OPPORTUNITY_NAME_REQUIRED: {
    key: 'sales.errors.opportunityNameRequired',
    status: 400,
  },
  OPPORTUNITY_CUSTOMER_REQUIRED: {
    key: 'sales.errors.opportunityCustomerRequired',
    status: 400,
  },
  OPPORTUNITY_NOT_FOUND: {
    key: 'sales.errors.opportunityNotFound',
    status: 404,
  },
  INVALID_AMOUNT: { key: 'sales.errors.invalidAmount', status: 400 },
  INVALID_STAGE: { key: 'sales.errors.invalidStage', status: 400 },
  INVALID_ID: { key: 'sales.errors.invalidId', status: 404 },
  INVALID_BODY: { key: 'sales.errors.invalidBody', status: 400 },
};

/** A request body that is JSON and an object, or a `SalesError` the caller can render. */
async function readBody(context: Context): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await context.req.json();
  } catch {
    throw new SalesError(
      'INVALID_BODY',
      'The request body must be valid JSON.',
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SalesError(
      'INVALID_BODY',
      'The request body must be a JSON object.',
    );
  }
  return parsed as Record<string, unknown>;
}

function pathId(context: Context, label: string): number {
  const id = Number(context.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new SalesError('INVALID_ID', `Invalid ${label} identifier.`);
  }
  return id;
}

function querySearch(context: Context): string | undefined {
  const value = context.req.query('search')?.trim();
  return value === '' ? undefined : value;
}

function queryCustomerId(context: Context): number | undefined {
  const raw = context.req.query('customerId');
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new SalesError('INVALID_ID', 'Invalid customer identifier.');
  }
  return id;
}

function queryStage(
  context: Context,
): 'following_up' | 'won' | 'lost' | undefined {
  const raw = context.req.query('stage');
  if (raw === undefined || raw === '') {
    return undefined;
  }
  if (!isOpportunityStage(raw)) {
    throw new SalesError(
      'INVALID_STAGE',
      'The requested stage does not exist.',
    );
  }
  return raw;
}

function queryList(context: Context): {
  search?: string;
  customerId?: number;
  stage?: 'following_up' | 'won' | 'lost';
} {
  const search = querySearch(context);
  const customerId = queryCustomerId(context);
  const stage = queryStage(context);
  return {
    ...(search === undefined ? {} : { search }),
    ...(customerId === undefined ? {} : { customerId }),
    ...(stage === undefined ? {} : { stage }),
  };
}

/**
 * The application's sales endpoints.
 *
 * Every path under `/sales` requires a session: the sub-router installs `auth.required()` on `*` before any handler,
 * and each handler still validates its own payload. The business rules live in `SalesService`; this file only reads
 * the request, calls the service, and maps a `SalesError` to its HTTP status and translated message.
 */
export const salesRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const { container } = app;
    const router = new Hono();
    const routes = new Hono();
    const authentication = container.resolve(authenticationToken);
    const sales: SalesService = container.resolve(salesServiceToken);

    routes.onError((error, context) => {
      if (!(error instanceof SalesError)) {
        throw error;
      }
      const mapped = SALES_ERRORS[error.code];
      if (!mapped) {
        throw error;
      }
      const translated = getRequestTranslator(context)(mapped.key);
      // A missing key comes back as the key itself; keep the service's English fallback in that case.
      const message = translated === mapped.key ? error.message : translated;
      return context.json({ code: error.code, message }, mapped.status);
    });

    routes.use('*', authentication.required());

    routes.get('/customers', async (context) =>
      context.json({ data: await sales.listCustomers(queryList(context)) }),
    );

    routes.post('/customers', async (context) => {
      const customer = await sales.createCustomer(await readBody(context));
      return context.json({ data: customer }, 201);
    });

    routes.get('/customers/:id', async (context) => {
      const customer = await sales.getCustomer(pathId(context, 'customer'));
      if (!customer) {
        throw new SalesError(
          'CUSTOMER_NOT_FOUND',
          'The customer does not exist.',
        );
      }
      return context.json({ data: customer });
    });

    routes.patch('/customers/:id', async (context) => {
      const customer = await sales.updateCustomer(
        pathId(context, 'customer'),
        await readBody(context),
      );
      return context.json({ data: customer });
    });

    routes.delete('/customers/:id', async (context) => {
      await sales.deleteCustomer(pathId(context, 'customer'));
      return context.json({ data: { deleted: true } });
    });

    routes.get('/contacts', async (context) =>
      context.json({ data: await sales.listContacts(queryList(context)) }),
    );

    routes.post('/contacts', async (context) => {
      const contact = await sales.createContact(await readBody(context));
      return context.json({ data: contact }, 201);
    });

    routes.get('/contacts/:id', async (context) => {
      const contact = await sales.getContact(pathId(context, 'contact'));
      if (!contact) {
        throw new SalesError(
          'CONTACT_NOT_FOUND',
          'The contact does not exist.',
        );
      }
      return context.json({ data: contact });
    });

    routes.patch('/contacts/:id', async (context) => {
      const contact = await sales.updateContact(
        pathId(context, 'contact'),
        await readBody(context),
      );
      return context.json({ data: contact });
    });

    routes.delete('/contacts/:id', async (context) => {
      await sales.deleteContact(pathId(context, 'contact'));
      return context.json({ data: { deleted: true } });
    });

    routes.get('/opportunities', async (context) =>
      context.json({ data: await sales.listOpportunities(queryList(context)) }),
    );

    routes.post('/opportunities', async (context) => {
      const opportunity = await sales.createOpportunity(
        await readBody(context),
      );
      return context.json({ data: opportunity }, 201);
    });

    routes.get('/opportunities/:id', async (context) => {
      const opportunity = await sales.getOpportunity(
        pathId(context, 'opportunity'),
      );
      if (!opportunity) {
        throw new SalesError(
          'OPPORTUNITY_NOT_FOUND',
          'The opportunity does not exist.',
        );
      }
      return context.json({ data: opportunity });
    });

    routes.patch('/opportunities/:id', async (context) => {
      const opportunity = await sales.updateOpportunity(
        pathId(context, 'opportunity'),
        await readBody(context),
      );
      return context.json({ data: opportunity });
    });

    routes.delete('/opportunities/:id', async (context) => {
      await sales.deleteOpportunity(pathId(context, 'opportunity'));
      return context.json({ data: { deleted: true } });
    });

    router.route('/sales', routes);
    return router;
  });
