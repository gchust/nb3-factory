import { RepositoryError } from '@nocobase/db';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  TodoTitleTakenError,
  todoServiceToken,
  type CreateTodoInput,
} from '../providers/todos.js';

const MAX_TITLE_LENGTH = 255;

interface CreateBody {
  readonly title?: unknown;
  readonly deadline?: unknown;
}

interface UpdateBody {
  readonly completed?: unknown;
}

function parseCreateBody(body: unknown): CreateTodoInput | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { title, deadline } = body as CreateBody;
  if (typeof title !== 'string') return undefined;
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TITLE_LENGTH) {
    return undefined;
  }
  if (typeof deadline !== 'string') return undefined;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return { title: trimmed, deadline: parsed.toISOString() };
}

/**
 * `GET`, `POST` and `PATCH /api/todos` for the minimal todo page.
 *
 * There is deliberately no endpoint that marks a todo expired: only the
 * scheduled `app.todo.expire` target does that, so the page cannot fake a
 * scheduling run by writing the database directly. Identity is required; the
 * page itself is an application page with `authz: 'skip'`, so authorization
 * beyond "signed in" is out of scope here.
 */
export const todoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const todos = app.container.resolve(todoServiceToken);

    routes.use('*', auth.required());

    routes.get('/', async (context) =>
      context.json({ data: await todos.list() }),
    );

    routes.post('/', async (context) => {
      const body: unknown = await context.req.json().catch(() => undefined);
      const input = parseCreateBody(body);
      if (!input) {
        return context.json(
          {
            code: 'INVALID_TODO',
            error: 'A title and a valid deadline are required.',
          },
          400,
        );
      }

      try {
        const todo = await todos.create(input);
        return context.json({ data: todo }, 201);
      } catch (error) {
        if (error instanceof TodoTitleTakenError) {
          return context.json(
            { code: 'TODO_TITLE_TAKEN', error: error.message },
            409,
          );
        }
        throw error;
      }
    });

    routes.patch('/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return context.json({ code: 'INVALID_TODO_ID' }, 400);
      }

      const body: unknown = await context.req.json().catch(() => undefined);
      if (typeof body !== 'object' || body === null) {
        return context.json({ code: 'INVALID_TODO' }, 400);
      }
      const { completed } = body as UpdateBody;
      if (typeof completed !== 'boolean') {
        return context.json({ code: 'INVALID_TODO' }, 400);
      }

      try {
        const todo = await todos.setCompleted(id, completed);
        return context.json({ data: todo });
      } catch (error) {
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        ) {
          return context.json({ code: 'TODO_NOT_FOUND' }, 404);
        }
        throw error;
      }
    });

    router.route('/todos', routes);
    return router;
  });
