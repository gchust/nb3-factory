import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponses,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { todoServiceToken, type TodoService } from '../providers/todos.js';
import { TodoSchema } from './schemas.js';

/** The page resource every todo route checks, the same id `client/routes.ts` declares for the page. */
export const TODO_ACCESS_RESOURCE = 'todos';

/** The `domain` of this application's errors, so a client can branch on `reason` within a known namespace. */
export const TODO_ERROR_DOMAIN = 'todos';

const tags = ['Todos'];
const accessDescription =
  'Requires the `page:todos/access` grant; without it the route answers 403 `TODO_ACCESS_REQUIRED`.';

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    // An isolated sub-router so the middleware below covers only `/api/todos` and cannot leak into a contribution
    // mounted later.
    const todosRoutes = new Hono<AuthorizationEnv>();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);

    // Render this application's errors in the standard body even when the router is mounted on its own.
    todosRoutes.onError((error, context) => apiErrorHandler(error, context));

    // This route owns its own security: it authenticates the caller and checks the page grant itself rather than
    // relying on another route's middleware or on registration order.
    todosRoutes.use('*', authentication.required(), authorization.middleware());
    todosRoutes.use('*', async (context, next) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'page', id: TODO_ACCESS_RESOURCE },
        action: 'access',
      });
      if (!allowed) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'TODO_ACCESS_REQUIRED',
          domain: TODO_ERROR_DOMAIN,
          message: 'Todo access is required.',
        });
      }
      await next();
    });

    todosRoutes.get(
      '/',
      describeRoute({
        tags,
        summary: 'List todos',
        operationId: 'listTodos',
        description: `Every todo, earliest due time first. ${accessDescription}`,
        responses: {
          200: listResponse(TodoSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const todos = app.container.resolve<TodoService>(todoServiceToken);
        return context.json({ data: await todos.list() });
      },
    );

    router.route('/todos', todosRoutes);
    return router;
  },
);
