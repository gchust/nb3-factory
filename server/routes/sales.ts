import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import { SalesError, salesServiceToken } from '../providers/sales-service.js';

/**
 * The sales API. Every route installs `auth.required()` itself: mounting under
 * `/api` authenticates nothing, and a route must never rely on middleware some
 * other contribution happened to add.
 *
 * The handlers stay thin. Validation, the customer-scoped total and the
 * business error codes live in `SalesService`.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(salesServiceToken);
    const required = auth.required();

    router.get('/customers', required, (context) =>
      guard(context, async () =>
        context.json({ data: await service.listCustomers() }),
      ),
    );

    router.post('/customers', required, (context) =>
      guard(context, async () => {
        const input = await readJson(context);
        return context.json({ data: await service.createCustomer(input) }, 201);
      }),
    );

    router.get('/customers/:id', required, (context) =>
      guard(context, async () =>
        context.json({ data: await service.getCustomer(readParamId(context)) }),
      ),
    );

    router.patch('/customers/:id', required, (context) =>
      guard(context, async () => {
        const input = await readJson(context);
        return context.json({
          data: await service.updateCustomer(readParamId(context), input),
        });
      }),
    );

    router.get('/contacts', required, (context) =>
      guard(context, async () =>
        context.json({
          data: await service.listContacts({
            customerId: readOptionalQueryId(context, 'customerId'),
          }),
        }),
      ),
    );

    router.post('/contacts', required, (context) =>
      guard(context, async () => {
        const input = await readJson(context);
        return context.json({ data: await service.createContact(input) }, 201);
      }),
    );

    router.patch('/contacts/:id', required, (context) =>
      guard(context, async () => {
        const input = await readJson(context);
        return context.json({
          data: await service.updateContact(readParamId(context), input),
        });
      }),
    );

    router.get('/opportunities', required, (context) =>
      guard(context, async () =>
        context.json({
          data: await service.listOpportunities({
            stage: context.req.query('stage'),
            customerId: readOptionalQueryId(context, 'customerId'),
          }),
        }),
      ),
    );

    router.post('/opportunities', required, (context) =>
      guard(context, async () => {
        const input = await readJson(context);
        return context.json(
          { data: await service.createOpportunity(input) },
          201,
        );
      }),
    );

    router.patch('/opportunities/:id', required, (context) =>
      guard(context, async () => {
        const input = await readJson(context);
        return context.json({
          data: await service.updateOpportunity(readParamId(context), input),
        });
      }),
    );

    return router;
  },
);

/** Runs a handler and turns a `SalesError` into its status and body. */
async function guard(
  context: Context,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SalesError) {
      const status = error.code.endsWith('_NOT_FOUND') ? 404 : 400;
      return context.json({ code: error.code, message: error.message }, status);
    }
    return context.json(
      { code: 'INTERNAL_ERROR', message: 'Internal error' },
      500,
    );
  }
}

async function readJson(
  context: Context,
): Promise<Readonly<Record<string, unknown>>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new SalesError('VALIDATION_ERROR', 'A JSON body is required');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new SalesError('VALIDATION_ERROR', 'A JSON object is required');
  }
  return body as Readonly<Record<string, unknown>>;
}

function readParamId(context: Context): number {
  const id = Number(context.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new SalesError('VALIDATION_ERROR', 'id must be a positive integer');
  }
  return id;
}

function readOptionalQueryId(
  context: Context,
  name: string,
): number | undefined {
  const raw = context.req.query(name);
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new SalesError(
      'VALIDATION_ERROR',
      `${name} must be a positive integer`,
    );
  }
  return id;
}
