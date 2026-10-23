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
import { ListTodosQuery, TodoSchema } from './schemas.js';

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const todos = app.container.resolve(todoServiceToken);

    // The todos are shared business data. A session is enough to read them; this route mutates nothing.
    router.use('/todos', auth.required());
    router.get(
      '/todos',
      describeRoute({
        tags: ['Todos'],
        summary: 'List todos',
        operationId: 'listTodos',
        responses: {
          '200': listResponse(TodoSchema),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListTodosQuery),
      async (context) => {
        const rows = await todos.list();
        return context.json({
          data: rows,
          meta: { total: rows.length },
        });
      },
    );

    return router;
  },
);
