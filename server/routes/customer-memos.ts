import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import { customerMemoServiceToken } from '../providers/index.js';
import {
  CustomerMemoNotFoundError,
  CustomerMemoValidationError,
  type CustomerMemoInput,
} from '../providers/customer-memos.js';

const BASE_PATH = '/customer-memos';

function parseId(value: string): number | undefined {
  if (!/^[1-9][0-9]*$/.test(value)) {
    return undefined;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

/** A body that is not a JSON object carries no memo fields; the service then reports the required name. */
function readInput(body: unknown): CustomerMemoInput {
  if (typeof body !== 'object' || body === null) {
    return {};
  }
  const record = body as Record<string, unknown>;
  return { name: record.name, note: record.note };
}

function domainErrorResponse(context: Context, error: unknown): Response {
  if (error instanceof CustomerMemoValidationError) {
    return context.json(
      { code: error.code, field: error.field, message: error.message },
      400,
    );
  }
  if (error instanceof CustomerMemoNotFoundError) {
    return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
  }
  // Anything else is unexpected: let the application turn it into a 500 and log it.
  throw error;
}

/**
 * CRUD endpoints for customer memos, mounted under `/api`.
 *
 * Every path under the base is authenticated here; the repository is the authorization boundary as well, so a
 * signed-in user reaches only this application's own data.
 */
export const customerMemoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const memos = app.container.resolve(customerMemoServiceToken);

    router.use(BASE_PATH, auth.required());
    router.use(`${BASE_PATH}/*`, auth.required());

    router.get(BASE_PATH, async (context) => {
      const search = context.req.query('search')?.trim();
      return context.json({ data: await memos.list(search) });
    });

    router.get(`${BASE_PATH}/:id`, async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'INVALID_ID' }, 400);
      }
      try {
        return context.json({ data: await memos.get(id) });
      } catch (error: unknown) {
        return domainErrorResponse(context, error);
      }
    });

    router.post(BASE_PATH, async (context) => {
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json({ code: 'INVALID_BODY' }, 400);
      }
      try {
        return context.json({ data: await memos.create(readInput(body)) }, 201);
      } catch (error: unknown) {
        return domainErrorResponse(context, error);
      }
    });

    router.patch(`${BASE_PATH}/:id`, async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'INVALID_ID' }, 400);
      }
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json({ code: 'INVALID_BODY' }, 400);
      }
      try {
        return context.json({ data: await memos.update(id, readInput(body)) });
      } catch (error: unknown) {
        return domainErrorResponse(context, error);
      }
    });

    router.delete(`${BASE_PATH}/:id`, async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'INVALID_ID' }, 400);
      }
      try {
        await memos.remove(id);
        return context.body(null, 204);
      } catch (error: unknown) {
        return domainErrorResponse(context, error);
      }
    });

    return router;
  });
