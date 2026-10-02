import { Hono, type Context } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import {
  IT_TICKET_CATEGORIES,
  IT_TICKET_STATUSES,
  type ItTicketCategory,
} from '../it-tickets-resources.js';
import {
  ItTicketConflictError,
  ItTicketForbiddenError,
  ItTicketNotFoundError,
  ItTicketValidationError,
  itTicketsServiceToken,
  type CreateItTicketInput,
} from '../it-tickets-service.js';

function parseId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function isCategory(value: unknown): value is ItTicketCategory {
  return (
    typeof value === 'string' &&
    (IT_TICKET_CATEGORIES as readonly string[]).includes(value)
  );
}

function isStatus(value: string): boolean {
  return (IT_TICKET_STATUSES as readonly string[]).includes(value);
}

function handle(error: unknown, context: Context<AuthorizationEnv>): Response {
  if (
    error instanceof AuthorizationDeniedError ||
    error instanceof ItTicketForbiddenError
  ) {
    return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
  }
  if (error instanceof ItTicketNotFoundError) {
    return context.json({ code: 'NOT_FOUND', message: error.message }, 404);
  }
  if (error instanceof ItTicketConflictError) {
    return context.json({ code: 'CONFLICT', message: error.message }, 409);
  }
  if (error instanceof ItTicketValidationError) {
    return context.json({ code: 'INVALID_INPUT', message: error.message }, 400);
  }
  throw error;
}

/**
 * IT repair tickets: employees submit and read their own, handlers read and
 * transition them. The routes own their security — authentication plus the
 * authorization middleware — and every handler enforces a composite action
 * through the service, so a row outside the caller's scope is invisible
 * rather than merely hidden by the interface.
 */
export const itTicketRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const tickets = app.container.resolve(itTicketsServiceToken);

    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    routes.use('*', auth.required(), authorization.middleware());

    routes.get('/', async (context) => {
      const status = context.req.query('status');
      if (status && !isStatus(status)) {
        return context.json(
          { code: 'INVALID_INPUT', message: 'Unknown status' },
          400,
        );
      }
      try {
        const data = await tickets.list(context.get('authz'), status);
        return context.json({ data });
      } catch (error) {
        return handle(error, context);
      }
    });

    routes.post('/', async (context) => {
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          { code: 'INVALID_INPUT', message: 'Invalid JSON body' },
          400,
        );
      }
      const input = (body ?? {}) as Record<string, unknown>;
      const title = typeof input.title === 'string' ? input.title : '';
      if (!title.trim()) {
        return context.json(
          { code: 'INVALID_INPUT', message: 'Title is required' },
          400,
        );
      }
      if (!isCategory(input.category)) {
        return context.json(
          { code: 'INVALID_INPUT', message: 'Unknown category' },
          400,
        );
      }
      if (
        input.description !== undefined &&
        input.description !== null &&
        typeof input.description !== 'string'
      ) {
        return context.json(
          { code: 'INVALID_INPUT', message: 'Invalid description' },
          400,
        );
      }
      const createInput: CreateItTicketInput = {
        title,
        category: input.category,
        description:
          typeof input.description === 'string' ? input.description : null,
      };
      try {
        const data = await tickets.create(context.get('authz'), createInput);
        return context.json({ data }, 201);
      } catch (error) {
        return handle(error, context);
      }
    });

    routes.get('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Ticket not found' },
          404,
        );
      }
      try {
        const data = await tickets.get(context.get('authz'), id);
        if (!data) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Ticket not found' },
            404,
          );
        }
        return context.json({ data });
      } catch (error) {
        return handle(error, context);
      }
    });

    routes.post('/:id/start', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Ticket not found' },
          404,
        );
      }
      try {
        const data = await tickets.start(context.get('authz'), id);
        return context.json({ data });
      } catch (error) {
        return handle(error, context);
      }
    });

    routes.post('/:id/complete', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Ticket not found' },
          404,
        );
      }
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          { code: 'INVALID_INPUT', message: 'Invalid JSON body' },
          400,
        );
      }
      const resolution = (body as Record<string, unknown> | null)?.resolution;
      try {
        const data = await tickets.complete(
          context.get('authz'),
          id,
          resolution,
        );
        return context.json({ data });
      } catch (error) {
        return handle(error, context);
      }
    });

    router.route('/it-tickets', routes);
    return router;
  });
