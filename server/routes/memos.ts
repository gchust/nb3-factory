import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  customerMemoServiceToken,
  MemoValidationError,
} from '../providers/index.js';

/**
 * Memo HTTP endpoints.
 *
 * The sub-router installs `auth.required()` on the whole `/memos` prefix so an
 * anonymous request never reaches the service. Every operation only needs the
 * caller's identity, so no per-resource permission check is layered on top.
 */
export const memoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const memos = app.container.resolve(customerMemoServiceToken);

    const routes = new Hono();
    routes.use('*', auth.required());

    routes.get('/', async (context) => {
      const search = context.req.query('search') ?? '';
      return context.json({ data: await memos.list(search) });
    });

    routes.post('/', async (context) => {
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          { code: 'INVALID_JSON', message: 'Request body must be JSON.' },
          400,
        );
      }

      try {
        const memo = await memos.create(body);
        return context.json({ data: memo }, 201);
      } catch (error) {
        if (error instanceof MemoValidationError) {
          return context.json(
            { code: error.code, message: error.message },
            400,
          );
        }
        throw error;
      }
    });

    routes.patch('/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return context.json(
          {
            code: 'INVALID_ID',
            message: 'Memo id must be a positive integer.',
          },
          400,
        );
      }

      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          { code: 'INVALID_JSON', message: 'Request body must be JSON.' },
          400,
        );
      }

      try {
        const memo = await memos.update(id, body);
        if (!memo) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Memo not found.' },
            404,
          );
        }
        return context.json({ data: memo });
      } catch (error) {
        if (error instanceof MemoValidationError) {
          return context.json(
            { code: error.code, message: error.message },
            400,
          );
        }
        throw error;
      }
    });

    routes.delete('/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return context.json(
          {
            code: 'INVALID_ID',
            message: 'Memo id must be a positive integer.',
          },
          400,
        );
      }

      const removed = await memos.remove(id);
      if (!removed) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Memo not found.' },
          404,
        );
      }

      return context.body(null, 204);
    });

    const router = new Hono();
    router.route('/memos', routes);
    return router;
  });
