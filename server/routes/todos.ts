import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  apiErrorResponse,
  apiValidator,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { todoServiceToken } from '../providers/todos.js';
import { ListTodosQuery, TodoPageMeta, TodoSchema } from './schemas.js';

/**
 * The read side of the todo feature. The overdue rule is not reachable over HTTP: it runs only from the Scheduler
 * target, so a browser cannot mark a todo overdue out of band.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  ({ container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);

    // Scoped to the one path this contribution owns, so it never authenticates another router's routes.
    router.use('/todos', authentication.required());

    router.get(
      '/todos',
      describeRoute({
        tags: ['Todos'],
        summary: 'List todos',
        operationId: 'listTodos',
        description:
          'Every todo, earliest due time first, paged by `page` and `pageSize`.',
        responses: {
          200: listResponse(TodoSchema, TodoPageMeta),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListTodosQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const { items, total } = await container
          .resolve(todoServiceToken)
          .list({ page, pageSize });

        return context.json({ data: items, meta: { page, pageSize, total } });
      },
    );

    return router;
  },
);
