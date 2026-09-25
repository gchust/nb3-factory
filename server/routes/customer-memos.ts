import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { RepositoryError } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import {
  CustomerMemoValidationError,
  customerMemoServiceToken,
} from '../providers/customer-memos.js';

/** Turns a domain failure into the HTTP response the client expects; anything else keeps travelling to the 500 handler. */
function errorResponse(context: Context, error: unknown): Response {
  if (error instanceof CustomerMemoValidationError) {
    return context.json({ code: error.code }, 422);
  }
  if (error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND') {
    return context.json({ code: 'RECORD_NOT_FOUND' }, 404);
  }
  throw error;
}

/** A route id is a positive integer; anything else names no record. */
function parseId(raw: string): number | undefined {
  if (!/^\d+$/u.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    throw new CustomerMemoValidationError('INVALID_BODY');
  }
}

export const customerMemoRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    // Every path this router owns authenticates independently: mounting under /api grants nothing.
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(customerMemoServiceToken);
    router.use('/customer-memos', auth.required());
    router.use('/customer-memos/*', auth.required());

    router.get('/customer-memos', async (context) => {
      const search = (context.req.query('search') ?? '').trim();
      return context.json({ data: await service.list(search) });
    });

    router.post('/customer-memos', async (context) => {
      try {
        const created = await service.create(await readJson(context));
        return context.json({ data: created }, 201);
      } catch (error: unknown) {
        return errorResponse(context, error);
      }
    });

    router.get('/customer-memos/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'RECORD_NOT_FOUND' }, 404);
      }
      const memo = await service.find(id);
      if (!memo) {
        return context.json({ code: 'RECORD_NOT_FOUND' }, 404);
      }
      return context.json({ data: memo });
    });

    router.patch('/customer-memos/:id', async (context) => {
      try {
        const id = parseId(context.req.param('id'));
        if (id === undefined) {
          return context.json({ code: 'RECORD_NOT_FOUND' }, 404);
        }
        const updated = await service.update(id, await readJson(context));
        return context.json({ data: updated });
      } catch (error: unknown) {
        return errorResponse(context, error);
      }
    });

    router.delete('/customer-memos/:id', async (context) => {
      try {
        const id = parseId(context.req.param('id'));
        if (id === undefined) {
          return context.json({ code: 'RECORD_NOT_FOUND' }, 404);
        }
        await service.remove(id);
        return context.json({ data: { deleted: true } });
      } catch (error: unknown) {
        return errorResponse(context, error);
      }
    });

    return router;
  });
