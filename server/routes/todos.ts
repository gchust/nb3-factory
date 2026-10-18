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
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { Hono } from 'hono';

import { todosServiceToken } from '../providers/todos/index.js';
import {
  createTodoBodySchema,
  todoParamsSchema,
  todoSchema,
  updateTodoBodySchema,
} from './schemas.js';

function todoNotFound(id: number): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'TODO_NOT_FOUND',
    domain: 'todos',
    message: `Todo ${id} was not found.`,
    metadata: { id },
  });
}

/**
 * Todo endpoints, scoped under `/todos`. Authentication is installed on this
 * sub-router alone so it cannot leak into another contribution, and every
 * action requires a signed-in session.
 */
export const todosApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const todos = app.container.resolve(todosServiceToken);

    const router = new Hono();

    router.use('*', auth.required());

    router.get(
      '/',
      describeRoute({
        tags: ['Todos'],
        summary: 'List todos',
        description: 'Lists every todo, earliest due date first.',
        operationId: 'listTodos',
        responses: {
          '200': listResponse(todoSchema),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      async (context) => {
        const records = await todos.list();
        return context.json({
          data: records,
          meta: { total: records.length },
        });
      },
    );

    router.get(
      '/:todoId',
      describeRoute({
        tags: ['Todos'],
        summary: 'Get a todo',
        operationId: 'getTodo',
        responses: {
          '200': dataResponse(todoSchema),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', todoParamsSchema),
      async (context) => {
        const { todoId } = context.req.valid('param');
        const todo = await todos.get(todoId);
        if (!todo) {
          throw todoNotFound(todoId);
        }
        return context.json({ data: todo });
      },
    );

    router.post(
      '/',
      describeRoute({
        tags: ['Todos'],
        summary: 'Create a todo',
        operationId: 'createTodo',
        responses: {
          '201': dataResponse(todoSchema, 'The created todo.'),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', createTodoBodySchema),
      async (context) => {
        const body = context.req.valid('json');
        const todo = await todos.create(body);
        return context.json({ data: todo }, 201);
      },
    );

    router.patch(
      '/:todoId',
      describeRoute({
        tags: ['Todos'],
        summary: 'Update a todo',
        description:
          'Updates the given fields. Completing a todo clears its overdue flag; reopening it past its due date sets it again.',
        operationId: 'updateTodo',
        responses: {
          '200': dataResponse(todoSchema),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', todoParamsSchema),
      apiValidator('json', updateTodoBodySchema),
      async (context) => {
        const { todoId } = context.req.valid('param');
        const todo = await todos.update(todoId, context.req.valid('json'));
        if (!todo) {
          throw todoNotFound(todoId);
        }
        return context.json({ data: todo });
      },
    );

    router.delete(
      '/:todoId',
      describeRoute({
        tags: ['Todos'],
        summary: 'Delete a todo',
        operationId: 'deleteTodo',
        responses: {
          '204': emptyResponse('The todo was deleted.'),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', todoParamsSchema),
      async (context) => {
        const { todoId } = context.req.valid('param');
        const deleted = await todos.remove(todoId);
        if (!deleted) {
          throw todoNotFound(todoId);
        }
        return context.body(null, 204);
      },
    );

    const contribution = new Hono();
    contribution.onError(apiErrorHandler);
    contribution.route('/todos', router);
    return contribution;
  });

export default todosApiRoutes;
