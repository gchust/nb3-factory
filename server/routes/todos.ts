import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { todoServiceToken } from '../providers/index.js';

const TITLE_MAX_LENGTH = 255;

interface CreateTodoBody {
  readonly title?: unknown;
}

interface UpdateTodoBody {
  readonly completed?: unknown;
}

function readTitle(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { title } = body as CreateTodoBody;
  return typeof title === 'string' ? title.trim() : undefined;
}

function readCompleted(body: unknown): boolean | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { completed } = body as UpdateTodoBody;
  return typeof completed === 'boolean' ? completed : undefined;
}

/**
 * The To-do API. It lives in its own sub-router so `auth.required()` stays
 * scoped to `/todos` and never leaks into another contribution mounted later.
 */
export const todoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const todos = app.container.resolve(todoServiceToken);

    const routes = new Hono();
    routes.use('*', auth.required());

    routes.get('/', async (context) =>
      context.json({ data: await todos.list() }),
    );

    routes.post('/', async (context) => {
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json({ code: 'INVALID_JSON' }, 400);
      }

      const title = readTitle(body);
      if (!title) {
        return context.json({ code: 'TITLE_REQUIRED' }, 400);
      }
      if (title.length > TITLE_MAX_LENGTH) {
        return context.json({ code: 'TITLE_TOO_LONG' }, 400);
      }

      const todo = await todos.create({ title });
      return context.json({ data: todo }, 201);
    });

    routes.patch('/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return context.json({ code: 'NOT_FOUND' }, 404);
      }

      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json({ code: 'INVALID_JSON' }, 400);
      }

      const completed = readCompleted(body);
      if (completed === undefined) {
        return context.json({ code: 'INVALID_COMPLETED' }, 400);
      }

      const todo = await todos.setCompleted(id, { completed });
      if (!todo) {
        return context.json({ code: 'NOT_FOUND' }, 404);
      }
      return context.json({ data: todo });
    });

    router.route('/todos', routes);
    return router;
  });
