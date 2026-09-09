import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  teamTodoServiceToken,
  TeamTodoNotFoundError,
  TeamTodoValidationError,
  TODO_STATUSES,
  type TeamTodoInput,
} from '../providers/team-todos.js';

/**
 * Team todos API. Every endpoint requires a signed-in session; the page and
 * the API are both login-only by design.
 */
export const teamTodoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const todos = app.container.resolve(teamTodoServiceToken);

    router.use('/team-todos', auth.required());
    router.use('/team-todos/*', auth.required());

    router.get('/team-todos', async (context) => {
      const search = context.req.query('search');
      const status = context.req.query('status');
      const result = await todos.list({
        search: search?.trim() ? search.trim() : undefined,
        status: isTodoStatus(status) ? status : undefined,
      });
      return context.json(result);
    });

    router.post('/team-todos', async (context) => {
      const body = await readJsonBody(context);
      if (!body) {
        return invalidBody(context);
      }
      try {
        const created = await todos.create(body);
        return context.json({ data: created }, 201);
      } catch (error) {
        return mapServiceError(context, error);
      }
    });

    router.put('/team-todos/:id', async (context) => {
      const id = readId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { error: { code: 'INVALID_ID', message: 'Invalid todo id.' } },
          400,
        );
      }
      const body = await readJsonBody(context);
      if (!body) {
        return invalidBody(context);
      }
      try {
        const updated = await todos.update(id, body);
        return context.json({ data: updated });
      } catch (error) {
        return mapServiceError(context, error);
      }
    });

    router.delete('/team-todos/:id', async (context) => {
      const id = readId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { error: { code: 'INVALID_ID', message: 'Invalid todo id.' } },
          400,
        );
      }
      const deleted = await todos.remove(id);
      if (!deleted) {
        return context.json(
          { error: { code: 'NOT_FOUND', message: 'Todo not found.' } },
          404,
        );
      }
      return context.json({ data: { id } });
    });

    return router;
  });

function isTodoStatus(
  value: string | undefined,
): value is (typeof TODO_STATUSES)[number] {
  return TODO_STATUSES.includes(value as (typeof TODO_STATUSES)[number]);
}

function readId(raw: string | undefined): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

async function readJsonBody(
  context: import('hono').Context,
): Promise<TeamTodoInput | undefined> {
  const body = await context.req.json<TeamTodoInput>().catch(() => undefined);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? body
    : undefined;
}

function invalidBody(context: import('hono').Context) {
  return context.json(
    { error: { code: 'INVALID_BODY', message: 'Invalid request body.' } },
    400,
  );
}

function mapServiceError(context: import('hono').Context, error: unknown) {
  if (error instanceof TeamTodoValidationError) {
    return context.json(
      { error: { code: error.code, message: error.message } },
      400,
    );
  }
  if (error instanceof TeamTodoNotFoundError) {
    return context.json(
      { error: { code: 'NOT_FOUND', message: error.message } },
      404,
    );
  }
  throw error;
}
