import { Hono, type Context } from 'hono';

import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { HTTPException } from 'hono/http-exception';

import {
  LabError,
  labServiceToken,
  type LabService,
} from '../providers/index.js';

/**
 * Shared plumbing for the laboratory HTTP layer.
 *
 * Every module router returned by `createFeatureRouter()` is mounted under
 * `/lab/<feature>`, and the only middleware that is installed on a broad path
 * is the authentication check placed in `server/routes/index.ts` on `/lab` and
 * `/lab/*`. Nothing here installs middleware on `*`, so a request that belongs
 * to another contribution is never touched by this one.
 */

export type LabHono = Hono<AuthEnv>;

export function createFeatureRouter(): LabHono {
  return new Hono<AuthEnv>({
    strict: false,
  });
}

/**
 * `AppRouterFactory` declares its return as a blank-environment `Hono`, but
 * these routers carry the authentication session in their variables. The cast
 * is confined to this one boundary; everything inside the module keeps the
 * `AuthEnv` type and therefore a checked `context.get('auth')`.
 */
export function asAppRouter(router: LabHono): Hono {
  return router as unknown as Hono;
}

export function labService(app: Application): LabService {
  return app.container.resolve(labServiceToken);
}

export function requireAuth(app: Application) {
  return app.container.resolve(authenticationToken).required();
}

/** The signed-in user's id. `auth.required()` has already refused anonymous callers. */
export function userId(context: Context<AuthEnv>): string {
  const session = context.get('auth');
  const id = session?.user?.id;
  if (!id) {
    throw new LabError(403, 'FORBIDDEN', 'Authentication required.');
  }
  return String(id);
}

export async function jsonBody(
  context: Context,
): Promise<Record<string, unknown>> {
  const contentType = context.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new LabError(
      400,
      'INVALID_INPUT',
      'Expected an application/json body.',
    );
  }
  let parsed: unknown;
  try {
    parsed = await context.req.json();
  } catch {
    throw new LabError(
      400,
      'INVALID_INPUT',
      'The request body is not valid JSON.',
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LabError(
      400,
      'INVALID_INPUT',
      'The request body must be a JSON object.',
    );
  }
  return parsed as Record<string, unknown>;
}

export function parseId(value: string | undefined, label = 'id'): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new LabError(
      400,
      'INVALID_INPUT',
      `${label} must be a positive integer.`,
    );
  }
  return parsed;
}

export function optionalIntQuery(
  context: Context,
  name: string,
): number | null {
  const raw = context.req.query(name);
  if (raw === undefined || raw === '') {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new LabError(400, 'INVALID_INPUT', `${name} must be an integer.`);
  }
  return parsed;
}

export function optionalTextQuery(
  context: Context,
  name: string,
): string | null {
  const raw = context.req.query(name);
  return raw === undefined || raw === '' ? null : raw;
}

/**
 * Maps a domain error to a response. `LabError` carries the status the domain
 * decided; anything else is a genuine defect and becomes a 500 with no internals
 * in the body.
 */
export function labErrorResponse(error: unknown, context: Context): Response {
  if (error instanceof LabError) {
    return context.json(
      { code: error.code, message: error.message },
      error.status,
    );
  }
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  throw error;
}

/**
 * Installs the domain-to-HTTP mapping as a router's error handler.
 *
 * A middleware that wraps `next()` cannot do this job: Hono resolves an
 * exception inside the innermost `dispatch` frame that has an error handler, so
 * an outer middleware's `next()` simply resolves — it never sees the throw. The
 * handler that does run lives on the `Hono` instance the request was dispatched
 * through.
 *
 * `route()` is how that handler reaches the application. When a router with a
 * non-default handler is mounted, Hono wraps each of its routes with
 * `compose([], router.onError)`. The routers built here are handed to
 * `defineApiRoutes`/`defineRootRoutes`, which the application mounts with
 * `route()`, so installing the mapping here covers every route this module
 * owns, including the ones added by a nested `route()` call.
 */
export function withLabErrorHandler<T extends LabHono>(router: T): T {
  router.onError((error, context) => labErrorResponse(error, context));
  return router;
}
