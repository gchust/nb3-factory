import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  CustomerMemoValidationError,
  customerMemoServiceToken,
  type CustomerMemoInput,
  type CustomerMemoService,
} from '../providers/index.js';

/**
 * Customer memo CRUD.
 *
 * Every handler sits behind `auth.required()`; the route owns its own
 * authentication rather than depending on a neighbouring contribution.
 */
export const customerMemoRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const memos: CustomerMemoService = app.container.resolve(
      customerMemoServiceToken,
    );

    const routes = new Hono();
    routes.use('*', auth.required());

    routes.get('/', async (context) => {
      const search = context.req.query('search');
      return context.json({ data: await memos.list(search) });
    });

    routes.post('/', async (context) => {
      const input = await readInput(context);
      if (!input) {
        return context.json({ code: 'INVALID_BODY' }, 400);
      }

      try {
        return context.json({ data: await memos.create(input) }, 201);
      } catch (error) {
        if (error instanceof CustomerMemoValidationError) {
          return context.json({ code: error.code }, 400);
        }

        throw error;
      }
    });

    routes.patch('/:id', async (context) => {
      const id = readId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'INVALID_ID' }, 400);
      }

      const input = await readInput(context);
      if (!input) {
        return context.json({ code: 'INVALID_BODY' }, 400);
      }

      try {
        const memo = await memos.update(id, input);
        if (!memo) {
          return context.json({ code: 'NOT_FOUND' }, 404);
        }

        return context.json({ data: memo });
      } catch (error) {
        if (error instanceof CustomerMemoValidationError) {
          return context.json({ code: error.code }, 400);
        }

        throw error;
      }
    });

    routes.delete('/:id', async (context) => {
      const id = readId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'INVALID_ID' }, 400);
      }

      const removed = await memos.remove(id);
      if (!removed) {
        return context.json({ code: 'NOT_FOUND' }, 404);
      }

      return context.body(null, 204);
    });

    router.route('/customer-memos', routes);
    return router;
  });

function readId(raw: string | undefined): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

async function readInput(
  context: Context,
): Promise<CustomerMemoInput | undefined> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return undefined;
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return undefined;
  }

  const { customerName, note } = body as Record<string, unknown>;
  if (typeof customerName !== 'string') {
    return undefined;
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return undefined;
  }

  return { customerName, note: note ?? null };
}
