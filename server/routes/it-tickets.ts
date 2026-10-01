import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';

import { ItTicketError, type ItTicketErrorCode } from '../it-tickets/domain.js';
import { itTicketServiceToken } from '../it-tickets/service.js';

/** HTTP status for each business rejection. Anything unmapped is a bad request. */
function statusFor(code: ItTicketErrorCode): 400 | 403 | 404 | 409 {
  switch (code) {
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'TICKET_COMPLETED':
    case 'INVALID_TRANSITION':
      return 409;
    default:
      return 400;
  }
}

/** Read a JSON object body, answering 400 instead of letting the parser throw a 500. */
async function readJsonObject(
  context: Context,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new ItTicketError('INVALID_FILTER', 'Expected a JSON object body.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ItTicketError('INVALID_FILTER', 'Expected a JSON object body.');
  }
  return body as Record<string, unknown>;
}

export const itTicketApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    // The endpoints need a session and a business decision, both supplied by
    // plugins. An assembly without them mounts nothing rather than serving
    // tickets unprotected.
    if (
      !app.container.has(authenticationToken) ||
      !app.container.has(authorizationToken)
    ) {
      return new Hono();
    }
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const service = app.container.resolve(itTicketServiceToken);
    const router = new Hono<AuthEnv & AuthorizationEnv>();

    // Middleware is attached per route rather than with `use('*')`: this router
    // is mounted at the application root, and a wildcard here would also run for
    // every other contribution's paths.

    /** Map business rejections to responses; anything else is a real error. */
    const respond = async (
      context: Context,
      run: () => Promise<Response>,
    ): Promise<Response> => {
      try {
        return await run();
      } catch (error) {
        if (error instanceof ItTicketError) {
          return context.json(
            { code: error.code, message: error.message },
            statusFor(error.code),
          );
        }
        throw error;
      }
    };

    router.get(
      '/it-tickets',
      auth.required(),
      authz.middleware(),
      async (context) =>
        respond(context, async () => {
          const status = context.req.query('status');
          const data = await service.list(context.get('authz'), { status });
          return context.json({ data });
        }),
    );

    router.post(
      '/it-tickets',
      auth.required(),
      authz.middleware(),
      bodyLimit({ maxSize: 64 * 1024 }),
      async (context) =>
        respond(context, async () => {
          const body = await readJsonObject(context);
          const data = await service.create(context.get('authz'), {
            title: body.title,
            category: body.category,
            description: body.description,
          });
          return context.json({ data }, 201);
        }),
    );

    router.get(
      '/it-tickets/:id',
      auth.required(),
      authz.middleware(),
      async (context) =>
        respond(context, async () => {
          const data = await service.detail(
            context.get('authz'),
            context.req.param('id'),
          );
          return context.json({ data });
        }),
    );

    router.post(
      '/it-tickets/:id/start',
      auth.required(),
      authz.middleware(),
      async (context) =>
        respond(context, async () => {
          const data = await service.start(
            context.get('authz'),
            context.req.param('id'),
          );
          return context.json({ data });
        }),
    );

    router.post(
      '/it-tickets/:id/complete',
      auth.required(),
      authz.middleware(),
      bodyLimit({ maxSize: 64 * 1024 }),
      async (context) =>
        respond(context, async () => {
          const body = await readJsonObject(context);
          const data = await service.complete(
            context.get('authz'),
            context.req.param('id'),
            body.resolution,
          );
          return context.json({ data });
        }),
    );

    // `createRouter` is handed a plain Hono, so mount the env-typed router that
    // carries `auth` and `authz` on a plain one.
    const contribution = new Hono();
    contribution.route('/', router);
    return contribution;
  });
