import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { todosServiceToken } from '../providers/todos.js';
import { TodoParams, TodoSchema, UpdateTodoInput } from './schemas.js';

const tags = ['Todos'];

/** The page grant a caller needs to reach any route below; see `client/routes.ts`. */
export const TODOS_ACCESS_RESOURCE = 'todos';

const accessDescription =
  'Requires the `page:todos/access` grant; without it the route answers 403 `TODO_ACCESS_REQUIRED`.';

/**
 * The todo list and its editing endpoint.
 *
 * Every route owns its own security: mounting under `/api` authenticates nothing, so the sub-router installs the
 * session requirement and the page check before its handlers. The sub-router is typed `AuthorizationEnv` so
 * `context.get('authz')` is the typed authorization context rather than `any`, and it is mounted at `/todos` so its
 * middleware covers exactly the two paths this contribution owns.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  ({ container }) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const todos = container.resolve(todosServiceToken);

    // Registered before the routes so it also covers the sub-router's own root, `GET /todos`.
    routes.use('*', authentication.required(), authorization.middleware());
    // Permission is checked before any todo is read, so a caller without access cannot probe which ids exist.
    routes.use('*', async (context, next) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'page', id: TODOS_ACCESS_RESOURCE },
        action: 'access',
      });
      if (!allowed) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'TODO_ACCESS_REQUIRED',
          domain: 'todos',
          message: 'Todo access is required.',
        });
      }
      await next();
    });

    routes.get(
      '/',
      describeRoute({
        tags,
        summary: 'List todos',
        operationId: 'listTodos',
        description: `Every todo, oldest first. ${accessDescription}`,
        responses: {
          200: listResponse(TodoSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => context.json({ data: await todos.list() }),
    );

    routes.patch(
      '/:todoId',
      describeRoute({
        tags,
        summary: 'Set whether a todo is completed',
        operationId: 'updateTodo',
        description: `Changes only the completed flag; the schedule owns \`expired\`. ${accessDescription}`,
        responses: {
          200: dataResponse(TodoSchema, 'The todo after the change.'),
          ...apiErrorResponses,
          404: apiErrorResponse(
            404,
            'No todo with this id exists (`TODO_NOT_FOUND`).',
          ),
        },
      }),
      apiValidator('param', TodoParams),
      apiValidator('json', UpdateTodoInput),
      async (context) => {
        const { todoId } = context.req.valid('param');
        const { completed } = context.req.valid('json');
        const record = await todos.setCompleted(todoId, completed);
        if (!record) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'TODO_NOT_FOUND',
            domain: 'todos',
            message: `Todo ${todoId} was not found.`,
          });
        }

        return context.json({ data: record });
      },
    );

    router.route('/todos', routes);
    return router;
  },
);

export default apiRoutes;
