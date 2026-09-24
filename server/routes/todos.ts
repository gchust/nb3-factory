import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { TodoRecord } from '../providers/overdue-todos.js';
import { Hono } from 'hono';

/**
 * Read-only list endpoint behind the todo page. The overdue flag it returns is
 * written only by the Scheduler target, never by this route.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const database = app.container.resolve(databaseManagerToken);

    router.use('/todos', auth.required());
    router.get('/todos', async (context) => {
      const todos = await database
        .repository<TodoRecord>('todos')
        .findMany({ sort: (sort) => sort.field('dueAt').asc() });

      return context.json({ data: todos });
    });

    return router;
  },
);

export default apiRoutes;
