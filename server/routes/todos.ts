import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { getRequestTranslator } from '@nocobase/i18n/server';
import { Hono } from 'hono';

import { todoServiceToken } from '../providers/index.js';

/**
 * Read access to the todos the scheduled task operates on.
 *
 * The route owns its security: it authenticates every request, runs the
 * authorization middleware, and then checks the `todos` page permission
 * explicitly, because mounting under `/api` grants nothing on its own.
 */
export const todosApiRoutes = defineApiRoutes<Application>(({ container }) => {
  const router = new Hono();
  // `AuthorizationEnv` is what types `context.get('authz')` after the
  // authorization middleware has run.
  const routes = new Hono<AuthorizationEnv>();

  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);

  routes.use(
    '*',
    authentication.required(),
    authorization.middleware(),
    async (context, next) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'page', id: 'todos' },
        action: 'access',
      });

      if (!allowed) {
        const t = getRequestTranslator(context);
        return context.json(
          {
            error: {
              code: 'TODO_ACCESS_DENIED',
              message: t('todos.accessDenied'),
            },
          },
          403,
        );
      }

      await next();
    },
  );

  routes.get('/', async (context) => {
    const todos = await container.resolve(todoServiceToken).list();
    return context.json({ data: todos });
  });

  router.route('/todos', routes);

  return router;
});
