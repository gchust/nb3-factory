import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { type Context, Hono } from 'hono';

import {
  CustomerMemoValidationError,
  customerMemoServiceToken,
  type CustomerMemoService,
} from '../providers/customer-memos.js';

/**
 * The `/api/customer-memos` endpoints.
 *
 * Mounting under `/api` authenticates nothing, so this router guards its own paths. The routes live on an isolated
 * sub-router mounted at the collection prefix, so `auth.required()` covers exactly this feature and no contribution
 * mounted later can inherit it.
 */
export const customerMemoRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const service = (): CustomerMemoService =>
      app.container.resolve(customerMemoServiceToken);

    routes.use('*', auth.required());

    routes.get('/', async (context) =>
      context.json({ data: await service().list() }),
    );

    routes.post('/', async (context) => {
      const body = await readJson(context);
      if (!body) {
        return context.json({ code: 'INVALID_JSON' }, 400);
      }

      try {
        const memo = await service().create({
          name: body.name,
          note: body.note,
        });
        return context.json({ data: memo }, 201);
      } catch (error) {
        return toErrorResponse(context, error);
      }
    });

    routes.get('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'CUSTOMER_MEMO_INVALID_ID' }, 400);
      }

      const memo = await service().get(id);
      if (!memo) {
        return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
      }
      return context.json({ data: memo });
    });

    routes.patch('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'CUSTOMER_MEMO_INVALID_ID' }, 400);
      }

      const body = await readJson(context);
      if (!body) {
        return context.json({ code: 'INVALID_JSON' }, 400);
      }

      try {
        const memo = await service().update(id, {
          name: body.name,
          note: body.note,
        });
        if (!memo) {
          return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
        }
        return context.json({ data: memo });
      } catch (error) {
        return toErrorResponse(context, error);
      }
    });

    routes.delete('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'CUSTOMER_MEMO_INVALID_ID' }, 400);
      }

      const removed = await service().remove(id);
      if (!removed) {
        return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
      }
      return context.body(null, 204);
    });

    router.route('/customer-memos', routes);
    return router;
  });

/** A positive integer path id; anything else is a bad request rather than a missing record. */
function parseId(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/u.test(value)) {
    return undefined;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

/** The request body as a plain object, or `undefined` when it is missing or not valid JSON. */
async function readJson(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await context.req.json();
    return body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Turns a rejected input into its coded 400; anything else is a real failure and keeps propagating. */
function toErrorResponse(
  context: Context<AuthEnv>,
  error: unknown,
): Response | Promise<Response> {
  if (error instanceof CustomerMemoValidationError) {
    return context.json({ code: error.code }, 400);
  }
  throw error;
}
