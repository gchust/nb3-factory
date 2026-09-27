import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  TodoTitleConflictError,
  todoServiceToken,
  type TodoCreateInput,
  type TodoService,
} from '../providers/todos.js';

interface TodoBody {
  readonly title?: unknown;
  readonly dueAt?: unknown;
}

interface TodoPatchBody {
  readonly completed?: unknown;
}

function parseCreateInput(body: TodoBody): TodoCreateInput | undefined {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return undefined;

  const dueAt = typeof body.dueAt === 'string' ? body.dueAt : '';
  const parsed = new Date(dueAt);
  if (!dueAt || Number.isNaN(parsed.getTime())) return undefined;

  return { title, dueAt: parsed.toISOString() };
}

/**
 * The todos page API. Every operation requires a signed-in session; the page
 * itself is open to every signed-in user (`authz: 'skip'`), so there is no
 * further business permission to check here.
 */
export const todosApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const todos: TodoService = app.container.resolve(todoServiceToken);

    routes.use('*', auth.required());

    routes.get('/', async (context) =>
      context.json({ data: await todos.list() }),
    );

    routes.post('/', async (context) => {
      const body = await context.req
        .json<TodoBody>()
        .catch((): TodoBody => ({}));
      const input = parseCreateInput(body);
      if (!input) {
        return context.json(
          {
            code: 'INVALID_TODO',
            message: 'title and a valid dueAt are required.',
          },
          400,
        );
      }

      try {
        return context.json({ data: await todos.create(input) }, 201);
      } catch (error) {
        if (error instanceof TodoTitleConflictError) {
          return context.json(
            { code: error.code, message: error.message },
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

      const body = await context.req
        .json<TodoPatchBody>()
        .catch((): TodoPatchBody => ({}));
      if (typeof body.completed !== 'boolean') {
        return context.json(
          {
            code: 'INVALID_TODO_PATCH',
            message: 'completed must be a boolean.',
          },
          400,
        );
      }

      const record = await todos.setCompleted(id, body.completed);
      if (!record) {
        return context.json({ code: 'TODO_NOT_FOUND' }, 404);
      }
      return context.json({ data: record });
    });

    router.route('/todos', routes);
    return router;
  });

export default todosApiRoutes;
