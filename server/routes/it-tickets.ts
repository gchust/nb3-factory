import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  IT_TICKET_STATUSES,
  type ItTicketStatus,
} from '../providers/it-tickets-constants.js';
import {
  itTicketServiceToken,
  ItTicketError,
} from '../providers/it-tickets.js';

/**
 * The IT ticket API.
 *
 * Every path installs `auth.required()` itself rather than relying on a
 * wildcard from another contribution. The service applies the role rules: an
 * employee only ever sees and creates their own tickets, a handler processes
 * the whole queue.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const auth = app.container.resolve(authenticationToken);
    const tickets = app.container.resolve(itTicketServiceToken);
    const routes = new Hono();

    routes.get('/it-tickets', auth.required(), async (context) => {
      const { user } = context.get('auth')!;
      const status = context.req.query('status');
      if (status !== undefined && !isStatus(status)) {
        return context.json({ code: 'IT_TICKET_INVALID_STATUS' }, 400);
      }
      const role = await tickets.resolveRole(user.id);
      const data = await tickets.list(user.id, role, status);
      return context.json({ data, meta: { canProcess: role === 'handler' } });
    });

    routes.post('/it-tickets', auth.required(), async (context) => {
      const { user } = context.get('auth')!;
      const body = await readJson(context);
      const data = await tickets.create(user.id, body);
      return context.json({ data }, 201);
    });

    routes.get('/it-tickets/:id', auth.required(), async (context) => {
      const { user } = context.get('auth')!;
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'IT_TICKET_INVALID_ID' }, 400);
      }
      const role = await tickets.resolveRole(user.id);
      const data = await tickets.get(user.id, role, id);
      return context.json({ data, meta: { canProcess: role === 'handler' } });
    });

    routes.post('/it-tickets/:id/start', auth.required(), async (context) => {
      const { user } = context.get('auth')!;
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'IT_TICKET_INVALID_ID' }, 400);
      }
      const role = await tickets.resolveRole(user.id);
      const data = await tickets.start(user.id, role, id);
      return context.json({ data });
    });

    routes.post(
      '/it-tickets/:id/complete',
      auth.required(),
      async (context) => {
        const { user } = context.get('auth')!;
        const id = parseId(context.req.param('id'));
        if (id === undefined) {
          return context.json({ code: 'IT_TICKET_INVALID_ID' }, 400);
        }
        const role = await tickets.resolveRole(user.id);
        const body = await readJson(context);
        const data = await tickets.complete(
          user.id,
          role,
          id,
          body.resolutionNote,
        );
        return context.json({ data });
      },
    );

    // One error boundary for the whole contribution, so a domain refusal
    // becomes the status it declares and nothing else is swallowed.
    routes.onError((error, context) => {
      if (error instanceof ItTicketError) {
        return context.json(
          { code: error.code },
          error.statusCode as ContentfulStatusCode,
        );
      }
      throw error;
    });

    return routes;
  },
);

function isStatus(value: string): value is ItTicketStatus {
  return (IT_TICKET_STATUSES as readonly string[]).includes(value);
}

function parseId(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/u.test(value)) {
    return undefined;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

async function readJson(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
