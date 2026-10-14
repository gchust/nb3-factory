import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import {
  CreateTodoInput,
  ListTodosQuery,
  TodoParams,
  TodoSchema,
  TodosPageMeta,
  UpdateTodoInput,
} from './schemas.js';
import { todosServiceToken } from '../providers/todos.js';

const tags = ['Todos'];

/**
 * The errors of a route that authenticates but checks no permission: a missing or invalid session, and an unexpected
 * failure. The `400` for invalid input is declared automatically by `apiValidator`.
 */
const authenticatedErrors = {
  401: apiErrorResponse(401),
  500: apiErrorResponse(500),
} as const;

function todoNotFound(todoId: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'TODO_NOT_FOUND',
    domain: 'app',
    message: `Todo ${todoId} was not found.`,
  });
}

export const apiRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  const todos = new Hono();
  const { container } = app;
  const authentication = container.resolve(authenticationToken);
  const service = container.resolve(todosServiceToken);

  todos.onError((error, context) => apiErrorHandler(error, context));
  todos.use('*', authentication.required());

  todos.get(
    '/',
    describeRoute({
      tags,
      summary: 'List todos',
      operationId: 'listTodos',
      responses: {
        200: listResponse(TodoSchema, TodosPageMeta),
        ...authenticatedErrors,
      },
    }),
    apiValidator('query', ListTodosQuery),
    async (context) => {
      const { page = 1, pageSize = 20 } = context.req.valid('query');
      const result = await service.list({ page, pageSize });
      return context.json({
        data: result.items,
        meta: { page, pageSize, total: result.total },
      });
    },
  );

  todos.post(
    '/',
    describeRoute({
      tags,
      summary: 'Create a todo',
      operationId: 'createTodo',
      responses: {
        201: dataResponse(TodoSchema, 'The created todo.'),
        ...authenticatedErrors,
      },
    }),
    apiValidator('json', CreateTodoInput),
    async (context) =>
      context.json(
        { data: await service.create(context.req.valid('json')) },
        201,
      ),
  );

  todos.get(
    '/:todoId',
    describeRoute({
      tags,
      summary: 'Get a todo',
      operationId: 'getTodo',
      responses: {
        200: dataResponse(TodoSchema),
        ...authenticatedErrors,
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', TodoParams),
    async (context) => {
      const todo = await service.get(context.req.valid('param').todoId);
      if (!todo) {
        throw todoNotFound(context.req.valid('param').todoId);
      }
      return context.json({ data: todo });
    },
  );

  todos.patch(
    '/:todoId',
    describeRoute({
      tags,
      summary: 'Update a todo',
      operationId: 'updateTodo',
      description:
        'Changes the title or due time, or marks the todo completed. `expired` is not settable: only the "check expired todos" schedule sets it.',
      responses: {
        200: dataResponse(TodoSchema),
        ...authenticatedErrors,
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', TodoParams),
    apiValidator('json', UpdateTodoInput),
    async (context) => {
      const { todoId } = context.req.valid('param');
      const todo = await service.update(todoId, context.req.valid('json'));
      if (!todo) {
        throw todoNotFound(todoId);
      }
      return context.json({ data: todo });
    },
  );

  todos.delete(
    '/:todoId',
    describeRoute({
      tags,
      summary: 'Delete a todo',
      operationId: 'deleteTodo',
      responses: {
        204: emptyResponse('The todo was deleted.'),
        ...authenticatedErrors,
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', TodoParams),
    async (context) => {
      const { todoId } = context.req.valid('param');
      if (!(await service.remove(todoId))) {
        throw todoNotFound(todoId);
      }
      return context.body(null, 204);
    },
  );

  // The application's own namespace: every todo route lives under `/api/todos`.
  router.route('/todos', todos);

  return router;
});
