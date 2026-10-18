import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  apiErrorResponse,
  apiValidator,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';

import { todoServiceToken, type TodoRecord } from '../providers/todos.js';
import { TodoListQuery, TodoPageMeta, TodoSchema } from './schemas.js';

const tags = ['Todos'];

/** The API's view of a todo: only what the page shows, with `dueAt` normalized to an ISO string. */
function toTodoView(record: TodoRecord) {
  return {
    id: record.id,
    title: record.title,
    dueAt: new Date(record.dueAt).toISOString(),
    completed: record.completed,
    overdue: record.overdue,
  };
}

/**
 * `/api/todos`: the read-only list the todo page shows, and the data behind the "检查过期待办" Schedule's effect.
 * Writing a todo is deliberately not offered — the walkthrough's rows come from the sample seed — so the page is a
 * plain reader and the only writer of `overdue` is the Schedule's target.
 */
export const todoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    if (!app.container.has(authenticationToken)) {
      return router;
    }

    const todos = app.container.resolve(todoServiceToken);
    router.use('/todos', app.container.resolve(authenticationToken).required());

    router.get(
      '/todos',
      describeRoute({
        tags,
        summary: 'List todos',
        operationId: 'todosListTodos',
        description:
          'Pages by `page` and `pageSize`, ordered by `dueAt`. Available to any signed-in caller; it grants no write.',
        responses: {
          200: listResponse(TodoSchema, TodoPageMeta),
          // A session is required; the query validator adds the 400 for a bad page.
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('query', TodoListQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const { records, total } = await todos.listPage({ page, pageSize });
        return context.json({
          data: records.map(toTodoView),
          meta: { page, pageSize, total },
        });
      },
    );

    return router;
  });
