import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  todoServiceToken,
  TodoTitleRequiredError,
  type TodoService,
} from '../providers/index.js';

export interface TodoRouteDependencies {
  readonly auth: Pick<Auth, 'required'>;
  readonly todos: TodoService;
}

async function readJsonBody(
  context: Context,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body = (await context.req.json()) as unknown;
    return body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The `/todos` endpoints, taking their dependencies explicitly so the HTTP contract can be exercised without an
 * Application.
 *
 * Authentication is installed on each route rather than as a middleware on a prefix, so the guard stays with the
 * route it protects and cannot leak into a contribution mounted later.
 */
export function createTodoRoutes({ auth, todos }: TodoRouteDependencies): Hono {
  const router = new Hono();
  const requireAuth = auth.required();

  router.get('/todos', requireAuth, async (context) =>
    context.json({ data: await todos.list() }),
  );

  router.post('/todos', requireAuth, async (context) => {
    const body = await readJsonBody(context);
    const title = typeof body?.title === 'string' ? body.title : '';
    try {
      return context.json({ data: await todos.create(title) }, 201);
    } catch (error) {
      if (error instanceof TodoTitleRequiredError) {
        return context.json(
          { code: 'TODO_TITLE_REQUIRED', error: 'A title is required.' },
          400,
        );
      }
      throw error;
    }
  });

  router.patch('/todos/:id', requireAuth, async (context) => {
    const id = Number(context.req.param('id'));
    const body = await readJsonBody(context);
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      typeof body?.completed !== 'boolean'
    ) {
      return context.json(
        {
          code: 'TODO_INVALID_REQUEST',
          error: 'A valid id and a boolean completed flag are required.',
        },
        400,
      );
    }
    const todo = await todos.setCompleted(id, body.completed);
    if (!todo) {
      return context.json(
        { code: 'TODO_NOT_FOUND', error: 'To-do not found.' },
        404,
      );
    }
    return context.json({ data: todo });
  });

  return router;
}

export const todoRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) =>
    createTodoRoutes({
      auth: app.container.resolve(authenticationToken),
      todos: app.container.resolve(todoServiceToken),
    }),
);
