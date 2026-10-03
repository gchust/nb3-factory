import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AuthorizationEnv } from '@nocobase/authorization/core';
import { databaseManagerToken, RepositoryError } from '@nocobase/db';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  ItTicketsError,
  completeItTicket,
  createItTicket,
  getItTicket,
  listItTickets,
  parseStatusFilter,
  parseTicketId,
  startItTicket,
  type ItTicketsErrorCode,
} from '../it-tickets/service.js';

const STATUS_BY_CODE: Readonly<
  Record<ItTicketsErrorCode, ContentfulStatusCode>
> = {
  FORBIDDEN: 403,
  TICKET_NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INVALID_STATE: 409,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(
  context: Context<AuthorizationEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body = await context.req.json<unknown>();
    return isObject(body) ? body : {};
  } catch {
    throw new ItTicketsError(
      'INVALID_INPUT',
      'Request body must be valid JSON.',
    );
  }
}

/**
 * The repair-request endpoints.
 *
 * The Client Route declares the page resource id `it-tickets`, so one
 * `page:it-tickets/access` grant governs the navigation entry, the page, and a
 * direct call to these endpoints. Each endpoint then authorizes its own
 * business action: `view`, `create`, `start` or `complete`.
 */
export const apiRoutes = defineApiRoutes<Application>((app) => {
  const { container } = app;
  const router = new Hono();
  const routes = new Hono<AuthorizationEnv>();
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const database = container.resolve(databaseManagerToken);

  routes.onError((error, context) => {
    if (error instanceof ItTicketsError) {
      return context.json(
        { code: error.code, message: error.message },
        STATUS_BY_CODE[error.code] ?? 400,
      );
    }
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    if (error instanceof RepositoryError) {
      // A state predicate lives in the update filter, so a lost race surfaces
      // as "no record matched". The caller's own values are not the problem.
      if (error.code === 'RECORD_NOT_FOUND') {
        return context.json(
          {
            code: 'INVALID_STATE',
            message: 'The request has already moved on.',
          },
          409,
        );
      }
      if (
        [
          'WRITE_FORBIDDEN',
          'FIELD_WRITE_FORBIDDEN',
          'READ_FORBIDDEN',
          'FIELD_READ_FORBIDDEN',
          'SCOPE_VIOLATION',
          'RECORD_OUTSIDE_SCOPE',
        ].includes(error.code)
      ) {
        return context.json(
          { code: 'FORBIDDEN', message: 'This action is not allowed.' },
          403,
        );
      }
      if (error.code === 'INVALID_POLICY' || error.code === 'POLICY_REQUIRED') {
        // A Policy the server could not build is a configuration defect, not a
        // client mistake; surface it as a server error instead of a 400.
        throw error;
      }
      return context.json({ code: error.code, message: error.message }, 400);
    }
    throw error;
  });

  // Identity first, then the request's authorization context. Every endpoint
  // below authorizes its own business action; mounting under `/api` protects
  // nothing on its own.
  routes.use('*', authentication.required(), authorization.middleware());

  routes.get('/tickets', async (context) => {
    const status = parseStatusFilter(context.req.query('status'));
    const result = await listItTickets(database, context.get('authz'), status);
    return context.json(result);
  });

  routes.get('/tickets/:id', async (context) => {
    const id = parseTicketId(context.req.param('id'));
    const data = await getItTicket(database, context.get('authz'), id);
    return context.json({ data });
  });

  routes.post('/tickets', async (context) => {
    const body = await readJson(context);
    const data = await createItTicket(database, context.get('authz'), {
      title: body.title,
      category: body.category,
      description: body.description,
    });
    return context.json({ data }, 201);
  });

  routes.post('/tickets/:id/start', async (context) => {
    const id = parseTicketId(context.req.param('id'));
    const data = await startItTicket(database, context.get('authz'), id);
    return context.json({ data });
  });

  routes.post('/tickets/:id/complete', async (context) => {
    const id = parseTicketId(context.req.param('id'));
    const body = await readJson(context);
    const data = await completeItTicket(
      database,
      context.get('authz'),
      id,
      body.resolution,
    );
    return context.json({ data });
  });

  router.route('/it', routes);
  return router;
});

export default apiRoutes;
