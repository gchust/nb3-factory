import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { ticketServiceToken } from './provider.js';
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  type Ticket,
} from './resources.js';
import { TicketStateError } from './service.js';

/** The composite business operation registered by the provider. */
const IT_TICKETS_RESOURCE = 'it.tickets';

const createTicketSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(TICKET_CATEGORIES),
  description: z.string().trim().max(5000).optional().nullable(),
});

const completeTicketSchema = z.object({
  resolution: z.string().trim().min(1).max(5000),
});

const listQuerySchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
});

type PermissionOutcome =
  | { readonly allowed: false }
  | { readonly allowed: true; readonly policy?: RepositoryPolicy<Ticket> };

/**
 * Folds one composite decision into the Repository Policy for `tickets`.
 * `permit` without conditions is an unrestricted decision (a superuser).
 */
async function permissionFor(
  context: Context<AuthorizationEnv>,
  action: 'view' | 'create' | 'start' | 'complete',
): Promise<PermissionOutcome> {
  const decision = await context.get('authz').authorize({
    resource: { type: 'composite', id: IT_TICKETS_RESOURCE },
    action,
  });

  if (decision.effect === 'deny') {
    return { allowed: false };
  }
  if (decision.effect === 'permit') {
    return { allowed: true };
  }
  const policy = decision.conditions?.database?.tickets;
  return policy ? { allowed: true, policy } : { allowed: false };
}

async function jsonBody(context: Context<AuthorizationEnv>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function notFound(context: Context<AuthorizationEnv>): Response {
  return context.json({ code: 'TICKET_NOT_FOUND' }, 404);
}

export function createTicketRoutes(app: Application): Hono<AuthorizationEnv> {
  const router = new Hono<AuthorizationEnv>();
  const authentication = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const service = app.container.resolve(ticketServiceToken);

  router.use('*', authentication.required(), authorization.middleware());

  router.get('/', async (context) => {
    const parsed = listQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json({ code: 'INVALID_QUERY' }, 422);
    }

    const outcome = await permissionFor(context, 'view');
    if (!outcome.allowed) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }

    return context.json({
      data: await service.list(outcome.policy, {
        status: parsed.data.status,
      }),
    });
  });

  router.get('/:id', async (context) => {
    const id = Number(context.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return notFound(context);
    }

    const outcome = await permissionFor(context, 'view');
    if (!outcome.allowed) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }

    const ticket = await service.get(outcome.policy, id);
    // An out-of-scope ticket is indistinguishable from a missing one.
    return ticket ? context.json({ data: ticket }) : notFound(context);
  });

  router.post('/', async (context) => {
    const parsed = createTicketSchema.safeParse(await jsonBody(context));
    if (!parsed.success) {
      return context.json(
        { code: 'INVALID_BODY', issues: parsed.error.issues },
        422,
      );
    }

    const outcome = await permissionFor(context, 'create');
    if (!outcome.allowed) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }

    const submitterId = context.get('authz').identity.principal.id;
    return context.json(
      {
        data: await service.create(
          outcome.policy,
          {
            title: parsed.data.title,
            category: parsed.data.category,
            description: parsed.data.description ?? null,
          },
          submitterId,
        ),
      },
      201,
    );
  });

  router.post('/:id/start', async (context) => {
    const id = Number(context.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return notFound(context);
    }

    const outcome = await permissionFor(context, 'start');
    if (!outcome.allowed) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }

    const handlerId = context.get('authz').identity.principal.id;
    try {
      return context.json({
        data: await service.start(outcome.policy, id, handlerId),
      });
    } catch (error) {
      return handleStateError(context, error);
    }
  });

  router.post('/:id/complete', async (context) => {
    const id = Number(context.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return notFound(context);
    }

    const parsed = completeTicketSchema.safeParse(await jsonBody(context));
    if (!parsed.success) {
      return context.json(
        { code: 'INVALID_BODY', issues: parsed.error.issues },
        422,
      );
    }

    const outcome = await permissionFor(context, 'complete');
    if (!outcome.allowed) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }

    const handlerId = context.get('authz').identity.principal.id;
    try {
      return context.json({
        data: await service.complete(
          outcome.policy,
          id,
          parsed.data.resolution,
          handlerId,
        ),
      });
    } catch (error) {
      return handleStateError(context, error);
    }
  });

  return router;
}

function handleStateError(
  context: Context<AuthorizationEnv>,
  error: unknown,
): Response {
  if (error instanceof TicketStateError) {
    if (error.code === 'TICKET_NOT_FOUND') {
      return notFound(context);
    }
    return context.json({ code: error.code, message: error.message }, 409);
  }
  throw error;
}

export const ticketRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    router.route('/tickets', createTicketRoutes(app));
    return router;
  });
