import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import { ticketsServiceToken } from '../providers/tickets/index.js';
import {
  TicketsError,
  type CreateTicketInput,
  type TicketNoteInput,
} from '../providers/tickets/service.js';

/**
 * The request carries both the authenticated session (set by the
 * authentication middleware) and the request-scoped authorization (set by the
 * authorization middleware). Naming both here is what lets a handler read
 * either without a cast.
 */
interface TicketsEnv {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
}

/**
 * Ticket endpoints.
 *
 * The route's whole job is HTTP: parse the body, hand the request's
 * authorization scope to the domain service and translate the result. It never
 * decides who may do what — the permission sets do, and the service asks them.
 * Mounting the middleware on the sub-router keeps the requirement scoped to
 * this prefix instead of leaking into every route registered afterwards.
 */
export const apiRoutes = defineApiRoutes<Application>(({ container }) => {
  const router = new Hono();
  const routes = new Hono<TicketsEnv>();
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);

  routes.onError((error, context) => {
    if (error instanceof TicketsError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    throw error;
  });

  routes.use('*', authentication.required(), authorization.middleware());

  routes.get('/', async (context) => {
    const result = await container
      .resolve(ticketsServiceToken)
      .list(context.get('authz'), context.req.query('status'));
    return context.json(result);
  });

  routes.post('/', async (context) => {
    const authz = context.get('authz');
    const body = await readBody(context);
    const ticket = await container
      .resolve(ticketsServiceToken)
      .create(authz, authz.identity.principal.id, createInput(body));
    return context.json({ data: ticket }, 201);
  });

  routes.get('/:id', async (context) => {
    const ticket = await container
      .resolve(ticketsServiceToken)
      .get(context.get('authz'), context.req.param('id'));
    return context.json({ data: ticket });
  });

  routes.post('/:id/start', async (context) => {
    const authz = context.get('authz');
    const ticket = await container
      .resolve(ticketsServiceToken)
      .start(
        authz,
        authz.identity.principal.id,
        context.req.param('id'),
        noteInput(await readBody(context)),
      );
    return context.json({ data: ticket });
  });

  routes.post('/:id/complete', async (context) => {
    const ticket = await container
      .resolve(ticketsServiceToken)
      .complete(
        context.get('authz'),
        context.req.param('id'),
        noteInput(await readBody(context)),
      );
    return context.json({ data: ticket });
  });

  router.route('/tickets', routes);
  return router;
});

async function readBody(
  context: Context<TicketsEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // An absent or malformed body is reported by the field validation below,
    // as a missing required field rather than as a JSON parse error.
  }
  return {};
}

function createInput(body: Record<string, unknown>): CreateTicketInput {
  return {
    title: body.title,
    category: body.category,
    description: body.description,
  };
}

function noteInput(body: Record<string, unknown>): TicketNoteInput {
  return { handlingNote: body.handlingNote };
}
