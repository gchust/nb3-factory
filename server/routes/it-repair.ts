import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { repairTicketServiceToken } from '../it-repair/provider.js';
import {
  RepairTicketConflictError,
  RepairTicketForbiddenError,
  RepairTicketNotFoundError,
  RepairTicketValidationError,
  type TicketActor,
} from '../it-repair/service.js';

const MAX_BODY_BYTES = 16 * 1024;

type ItRepairEnv = AuthorizationEnv & AuthEnv;

/**
 * The IT repair API.
 *
 * The route owns authentication and request-shape validation; the service owns
 * the workflow rules and the Repository writes under the policy the
 * authorization decision returned.
 */
async function createRouter(app: Application): Promise<Hono<ItRepairEnv>> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const service = app.container.resolve(repairTicketServiceToken);
  const router = new Hono<ItRepairEnv>();

  // Scoped to this route's own prefix, so the middleware never leaks into a
  // contribution mounted after it.
  router.use('/it-repair/*', auth.required(), authz.middleware());

  router.get('/it-repair/tickets', async (context) => {
    const actor = ticketActor(context);
    const status = context.req.query('status');
    const data = await run(() =>
      service.list(context.var.authz, actor, { status }),
    );
    return context.json({
      data,
      capabilities: await service.capabilities(context.var.authz),
    });
  });

  router.post('/it-repair/tickets', async (context) => {
    const actor = ticketActor(context);
    const body = await jsonBody(context);
    const data = await run(() =>
      service.create(context.var.authz, actor, {
        title: body.title as string,
        category: body.category as string,
        description: body.description as string | null | undefined,
      }),
    );
    return context.json({ data }, 201);
  });

  router.get('/it-repair/tickets/:id', async (context) => {
    const actor = ticketActor(context);
    const data = await run(() =>
      service.get(context.var.authz, actor, ticketId(context)),
    );
    return context.json({ data });
  });

  router.post('/it-repair/tickets/:id/start', async (context) => {
    const actor = ticketActor(context);
    const data = await run(() =>
      service.start(context.var.authz, actor, ticketId(context)),
    );
    return context.json({ data });
  });

  router.post('/it-repair/tickets/:id/complete', async (context) => {
    const actor = ticketActor(context);
    const body = await jsonBody(context);
    const data = await run(() =>
      service.complete(
        context.var.authz,
        actor,
        ticketId(context),
        body.resolution as string,
      ),
    );
    return context.json({ data });
  });

  return router;
}

function ticketActor(context: Context<ItRepairEnv>): TicketActor {
  const user = context.var.auth?.user;
  if (!user) {
    throw httpError(401, {
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }
  return { id: String(user.id), name: user.name || String(user.id) };
}

function ticketId(context: Context<ItRepairEnv>): number {
  const id = Number(context.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, { code: 'INVALID_ID', message: 'Invalid ticket id' });
  }
  return id;
}

async function jsonBody(
  context: Context<ItRepairEnv>,
): Promise<Record<string, unknown>> {
  const declared = context.req.header('content-length');
  if (declared !== undefined && Number(declared) > MAX_BODY_BYTES) {
    throw httpError(413, {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body too large',
    });
  }
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw httpError(400, { code: 'INVALID_JSON', message: 'Invalid JSON' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, {
      code: 'INVALID_JSON',
      message: 'Expected a JSON object',
    });
  }
  return body as Record<string, unknown>;
}

/** Runs a service call, translating its domain errors into HTTP responses. */
async function run<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof RepairTicketValidationError) {
      throw httpError(400, {
        code: 'VALIDATION_ERROR',
        message: error.message,
        field: error.field,
      });
    }
    if (error instanceof RepairTicketNotFoundError) {
      throw httpError(404, { code: 'NOT_FOUND', message: error.message });
    }
    if (error instanceof RepairTicketForbiddenError) {
      throw httpError(403, { code: 'FORBIDDEN', message: error.message });
    }
    if (error instanceof RepairTicketConflictError) {
      throw httpError(409, {
        code: 'CONFLICT',
        message: error.message,
        reason: error.reason,
      });
    }
    throw error;
  }
}

/**
 * An error response the router returns as-is. Hono's default handler renders
 * the `Response` when one is attached, so the JSON body and status are ours.
 */
function httpError(
  status: ContentfulStatusCode,
  body: Record<string, unknown>,
): HTTPException {
  return new HTTPException(status, {
    message: typeof body.message === 'string' ? body.message : undefined,
    res: Response.json(body, { status }),
  });
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  async (app) => (await createRouter(app)) as unknown as Hono,
);
