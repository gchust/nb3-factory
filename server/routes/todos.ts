import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { todoServiceToken } from '../providers/todo.js';
import { TodoParams, TodoSchema, UpdateTodoInput } from './schemas.js';

/**
 * The todo page's own API. Every route requires a session but checks no business permission: the todo page is
 * reachable by any signed-in user. `GET /api/todos` never marks anything expired — the scheduled task owns that
 * write, and a read must not change state.
 */
export const todoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const todos = app.container.resolve(todoServiceToken);

    router.get(
      '/todos',
      auth.required(),
      describeRoute({
        tags: ['Todos'],
        summary: 'List todos',
        operationId: 'listTodos',
        responses: {
          '200': listResponse(TodoSchema),
          // Requires a session but checks no permission, so it lists its statuses instead of spreading
          // `apiErrorResponses`.
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      async (context) => {
        const rows = await todos.list();
        return context.json({ data: rows, meta: { total: rows.length } });
      },
    );

    router.patch(
      '/todos/:todoId',
      auth.required(),
      describeRoute({
        tags: ['Todos'],
        summary: 'Update a todo',
        operationId: 'updateTodo',
        responses: {
          '200': dataResponse(TodoSchema, 'The todo after the change.'),
          '401': apiErrorResponse(401),
          // A missing id is answered by the repository as `RECORD_NOT_FOUND`.
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', TodoParams),
      apiValidator('json', UpdateTodoInput),
      async (context) => {
        const { todoId } = context.req.valid('param');
        const { completed } = context.req.valid('json');
        return context.json({
          data: await todos.setCompleted(String(todoId), completed),
        });
      },
    );

    return router;
  });
