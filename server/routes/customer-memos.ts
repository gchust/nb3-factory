import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context, type Handler } from 'hono';

import {
  customerMemoServiceToken,
  type CustomerMemoService,
} from '../providers/customer-memos.js';

export interface CreateCustomerMemoRoutesOptions {
  readonly auth: Auth;
  readonly service: CustomerMemoService;
}

/** Parses a JSON request body, returning `undefined` for malformed input. */
async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function asRecord(body: unknown): Record<string, unknown> | undefined {
  return body !== null && typeof body === 'object'
    ? (body as Record<string, unknown>)
    : undefined;
}

/** Returns the trimmed customer name, or `undefined` when it is missing or blank. */
function readName(body: unknown): string | undefined {
  const record = asRecord(body);
  if (record === undefined || typeof record.name !== 'string') return undefined;
  const name = record.name.trim();
  return name.length > 0 ? name : undefined;
}

/** Returns trimmed notes, collapsing blank input to `null`. */
function readNotes(body: unknown): string | null {
  const record = asRecord(body);
  if (record === undefined || typeof record.notes !== 'string') return null;
  const notes = record.notes.trim();
  return notes.length > 0 ? notes : null;
}

/** Parses a positive integer route id, or `undefined` when it is not one. */
function readId(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/u.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/**
 * Builds the customer memo HTTP surface.
 *
 * The whole router is returned rather than mutating a caller's router, and the
 * authentication middleware is scoped to this sub-router's `*` so it cannot
 * leak into another route contribution. Keeping the factory separate from the
 * container lookup lets the handlers be exercised without an application.
 */
export function createCustomerMemoRoutes(
  options: CreateCustomerMemoRoutesOptions,
): Hono {
  const router = new Hono();
  const routes = new Hono<AuthEnv>();

  routes.use('*', options.auth.required());

  routes.get('/', async (context) =>
    context.json({ data: await options.service.list() }),
  );

  routes.get('/:id', async (context) => {
    const id = readId(context.req.param('id'));
    if (id === undefined) {
      return context.json(
        { code: 'INVALID_ID', message: 'Invalid customer memo id.' },
        400,
      );
    }
    const memo = await options.service.get(id);
    if (memo === undefined) {
      return context.json(
        { code: 'NOT_FOUND', message: 'Customer memo not found.' },
        404,
      );
    }
    return context.json({ data: memo });
  });

  routes.post('/', async (context) => {
    const body = await readJson(context);
    const name = readName(body);
    if (name === undefined) {
      return context.json(
        { code: 'NAME_REQUIRED', message: 'Customer name is required.' },
        400,
      );
    }
    const memo = await options.service.create({
      name,
      notes: readNotes(body),
    });
    return context.json({ data: memo }, 201);
  });

  const update: Handler<AuthEnv> = async (context) => {
    const id = readId(context.req.param('id'));
    if (id === undefined) {
      return context.json(
        { code: 'INVALID_ID', message: 'Invalid customer memo id.' },
        400,
      );
    }
    const body = await readJson(context);
    const name = readName(body);
    if (name === undefined) {
      return context.json(
        { code: 'NAME_REQUIRED', message: 'Customer name is required.' },
        400,
      );
    }
    const memo = await options.service.update(id, {
      name,
      notes: readNotes(body),
    });
    if (memo === undefined) {
      return context.json(
        { code: 'NOT_FOUND', message: 'Customer memo not found.' },
        404,
      );
    }
    return context.json({ data: memo });
  };

  routes.put('/:id', update);
  routes.patch('/:id', update);

  routes.delete('/:id', async (context) => {
    const id = readId(context.req.param('id'));
    if (id === undefined) {
      return context.json(
        { code: 'INVALID_ID', message: 'Invalid customer memo id.' },
        400,
      );
    }
    const removed = await options.service.remove(id);
    if (!removed) {
      return context.json(
        { code: 'NOT_FOUND', message: 'Customer memo not found.' },
        404,
      );
    }
    return context.body(null, 204);
  });

  // The sub-router is mounted under its own prefix and owns its `*` middleware,
  // so the authentication requirement covers exactly these handlers.
  router.route('/customer-memos', routes);
  return router;
}

/** Resolves the application's authentication and customer memo service. */
export const customerMemoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(customerMemoServiceToken);
    return createCustomerMemoRoutes({ auth, service });
  });
