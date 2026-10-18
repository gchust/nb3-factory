import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { todosServiceToken, type TodoRecord } from '../providers/todos.js';
import {
  CreateTodoInput,
  ListTodosQuery,
  Todo,
  TodoListMeta,
  TodoParams,
  UpdateTodoInput,
  type TodoView,
} from './schemas.js';

function toTodoView(record: TodoRecord): TodoView {
  return {
    id: String(record.id),
    title: record.title,
    dueAt: record.dueAt,
    completed: record.completed,
    expired: record.expired,
  };
}

/**
 * `/todos` is a small internal resource: the session is required, and every signed-in user may read and write every
 * todo. There is no per-record ownership here, so the routes install authentication and no authorization check; a
 * business rule that restricted access would add `authorization.middleware()` with a resource and action.
 */
export const todoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const todos = app.container.resolve(todosServiceToken);

    router.use('/todos', auth.required());
    router.use('/todos/*', auth.required());

    router.get(
      '/todos',
      describeRoute({
        tags: ['Todos'],
        summary: 'List todos',
        operationId: 'listTodos',
        responses: {
          '200': listResponse(Todo, TodoListMeta, 'Todos by deadline.'),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListTodosQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const { records, total } = await todos.list({
          limit: pageSize,
          offset: (page - 1) * pageSize,
        });
        return context.json({
          data: records.map(toTodoView),
          meta: { total, page, pageSize },
        });
      },
    );

    router.post(
      '/todos',
      describeRoute({
        tags: ['Todos'],
        summary: 'Create a todo',
        operationId: 'createTodo',
        responses: {
          '201': dataResponse(Todo, 'The created todo.'),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateTodoInput),
      async (context) => {
        const { title, dueAt } = context.req.valid('json');
        const record = await todos.create({ title, dueAt });
        return context.json({ data: toTodoView(record) }, 201);
      },
    );

    router.patch(
      '/todos/:todoId',
      describeRoute({
        tags: ['Todos'],
        summary: 'Update a todo',
        operationId: 'updateTodo',
        responses: {
          '200': dataResponse(Todo, 'The updated todo.'),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404, 'No todo has this id.'),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', TodoParams),
      apiValidator('json', UpdateTodoInput),
      async (context) => {
        const todoId = Number.parseInt(context.req.valid('param').todoId, 10);
        const { completed } = context.req.valid('json');
        const record = await todos.setCompleted(todoId, completed);
        if (!record) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'TODO_NOT_FOUND',
            domain: 'app',
            message: `Todo ${todoId} was not found.`,
          });
        }
        return context.json({ data: toTodoView(record) });
      },
    );

    return router;
  });
