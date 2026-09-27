import { RepositoryError } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { isItTransition } from './rules.js';
import { itTicketServiceToken } from './provider.js';
import { ItTicketError, mapRepositoryError } from './service.js';

const MAX_BODY_BYTES = 16 * 1024;

/** Turns a domain or repository failure into the API's error response. */
function toErrorResponse(
  context: Context<AuthorizationEnv>,
  error: unknown,
): Response {
  if (error instanceof ItTicketError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return context.json({ code: 'FORBIDDEN' }, 403);
      case 'NOT_FOUND':
        return context.json({ code: 'NOT_FOUND' }, 404);
      case 'INVALID_TRANSITION':
        return context.json(
          { code: 'INVALID_TRANSITION', reason: error.reason },
          409,
        );
      case 'INVALID_INPUT':
        return context.json(
          { code: 'INVALID_INPUT', reason: error.reason },
          400,
        );
    }
  }
  if (error instanceof RepositoryError) {
    return toErrorResponse(context, mapRepositoryError(error));
  }
  throw error;
}

async function guard(
  context: Context<AuthorizationEnv>,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return toErrorResponse(context, error);
  }
}

function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0)
    throw new ItTicketError('INVALID_INPUT', 'INVALID_ID');
  return id;
}

async function readJson(
  context: Context<AuthorizationEnv>,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new ItTicketError('INVALID_INPUT', 'INVALID_BODY');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ItTicketError('INVALID_INPUT', 'INVALID_BODY');
  return body as Record<string, unknown>;
}

/**
 * The IT ticket API. The router owns its own authentication and authorization
 * middleware, so mounting it under `/api` never makes an endpoint public.
 *
 * Every handler resolves its data policy from the composite decision inside the
 * service, so a ticket the caller may not see is reported as `NOT_FOUND` rather
 * than leaked. An employee holds no `handle` grant, which is what makes the
 * start and complete endpoints answer `403` for them.
 */
export function createItTicketRouter(app: Application): Hono<AuthorizationEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const tickets = app.container.resolve(itTicketServiceToken);

  const routes = new Hono<AuthorizationEnv>();
  routes.use('*', auth.required(), authz.middleware());

  routes.get('/', (context) =>
    guard(context, async () => {
      const query = new URL(context.req.url).searchParams;
      const data = await tickets.list(context.get('authz'), {
        status: query.get('status') ?? undefined,
        category: query.get('category') ?? undefined,
        keyword: query.get('keyword') ?? undefined,
      });
      return context.json({ data });
    }),
  );

  routes.post('/', bodyLimit({ maxSize: MAX_BODY_BYTES }), (context) =>
    guard(context, async () => {
      const data = await tickets.create(
        context.get('authz'),
        await readJson(context),
      );
      return context.json({ data }, 201);
    }),
  );

  routes.get('/:id', (context) =>
    guard(context, async () => {
      const data = await tickets.get(
        context.get('authz'),
        parseId(context.req.param('id')),
      );
      return context.json({ data });
    }),
  );

  routes.patch('/:id', bodyLimit({ maxSize: MAX_BODY_BYTES }), (context) =>
    guard(context, async () => {
      const body = await readJson(context);
      const transition = body.action;
      if (!isItTransition(transition))
        throw new ItTicketError('INVALID_INPUT', 'INVALID_TRANSITION');
      const data = await tickets.transition(
        context.get('authz'),
        parseId(context.req.param('id')),
        { transition, resolution: body.resolution },
      );
      return context.json({ data });
    }),
  );

  return routes;
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    // The ticket API owns its authentication and authorization middleware, so
    // the services behind them must exist before it mounts. An embedded runtime
    // composed without the authentication or authorization plugin cannot answer
    // a ticket request at all, and mounting nothing keeps that runtime usable
    // for its other routes instead of failing at startup. The application's own
    // `server/plugins.ts` always registers both plugins.
    if (
      app.container.has(authenticationToken) &&
      app.container.has(authorizationToken)
    ) {
      router.route('/it/tickets', createItTicketRouter(app));
    }
    return router;
  },
);

export default apiRoutes;
