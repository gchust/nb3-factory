import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { todoServiceToken } from '../providers/todo.js';
import {
  CreateTodoInput,
  TodoListMeta,
  TodoListQuery,
  TodoParams,
  TodoSchema,
  UpdateTodoInput,
} from './schemas.js';

const TODO_ERROR_DOMAIN = 'todos';
const TODO_PAGE_RESOURCE = 'todos';

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    // The authorization middleware populates `authz`; keep that typed environment on an isolated subrouter and mount
    // it below, because the route contribution itself is a plain Hono app.
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const todos = app.container.resolve(todoServiceToken);

    routes.use('*', auth.required(), authorization.middleware());
    // Todos are personal working data: one page grant covers the page and the API it calls. This is checked before any
    // validator, so a caller without the grant learns nothing about the input shape or which ids exist.
    routes.use('*', async (context, next) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'page', id: TODO_PAGE_RESOURCE },
        action: 'access',
      });
      if (!allowed) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'TODO_ACCESS_REQUIRED',
          domain: TODO_ERROR_DOMAIN,
          message: 'Access to the Todos page is required.',
        });
      }
      await next();
    });

    routes.get(
      '/',
      describeRoute({
        tags: ['Todos'],
        summary: 'List todos',
        operationId: 'listTodos',
        description:
          'Pages by `page` and `pageSize`, ordered by due time. Requires the `page:todos/access` grant.',
        responses: {
          200: listResponse(TodoSchema, TodoListMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', TodoListQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const { items, total } = await todos.list({ page, pageSize });
        return context.json({ data: items, meta: { page, pageSize, total } });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags: ['Todos'],
        summary: 'Create a todo',
        operationId: 'createTodo',
        responses: {
          201: dataResponse(TodoSchema, 'The created todo.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateTodoInput),
      async (context) =>
        context.json(
          { data: await todos.create(context.req.valid('json')) },
          201,
        ),
    );

    routes.patch(
      '/:todoId',
      describeRoute({
        tags: ['Todos'],
        summary: 'Update a todo',
        operationId: 'updateTodo',
        responses: {
          200: dataResponse(TodoSchema, 'The updated todo.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', TodoParams),
      apiValidator('json', UpdateTodoInput),
      async (context) =>
        context.json({
          data: await todos.update(
            context.req.valid('param').todoId,
            context.req.valid('json'),
          ),
        }),
    );

    routes.delete(
      '/:todoId',
      describeRoute({
        tags: ['Todos'],
        summary: 'Delete a todo',
        operationId: 'deleteTodo',
        responses: {
          204: emptyResponse('The todo was deleted.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', TodoParams),
      async (context) => {
        await todos.remove(context.req.valid('param').todoId);
        return context.body(null, 204);
      },
    );

    router.route('/todos', routes);
    return router;
  },
);
