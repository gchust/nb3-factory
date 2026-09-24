import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';

import {
  ServiceRequestError,
  serviceRequestsServiceToken,
} from '../providers/index.js';

function errorResponse(error: unknown): {
  body: { error: string; message: string };
  status: 400 | 404 | 503;
} {
  if (error instanceof ServiceRequestError) {
    switch (error.code) {
      case 'not-found':
        return {
          body: { error: error.code, message: error.message },
          status: 404,
        };
      case 'workflow-unavailable':
        return {
          body: { error: error.code, message: error.message },
          status: 503,
        };
      default:
        return {
          body: { error: error.code, message: error.message },
          status: 400,
        };
    }
  }
  throw error;
}

/**
 * Service request API.
 *
 * The simplified scenario has one supervisor and one assignee, both
 * authenticated, with no role split, so identity is the only gate here:
 * `auth.required()` is installed on every path this router owns. There is no
 * shared middleware leaking into other contributions and no reliance on
 * registration order.
 */
export const serviceRequestApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(serviceRequestsServiceToken);

    router.use('/service-requests', auth.required());
    router.use('/service-requests/*', auth.required());

    router.get('/service-requests', async (context) =>
      context.json({ data: await service.list() }),
    );

    // Registered before `/:id` so the literal path is never read as an id.
    router.get('/service-requests/assignees', async (context) =>
      context.json({ data: await service.listAssignees() }),
    );

    router.post('/service-requests', async (context) => {
      try {
        const parsed = (await context.req.json().catch(() => null)) as unknown;
        const body: Record<string, unknown> =
          parsed !== null && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : {};
        const request = await service.create({
          title: body.title,
          urgent: body.urgent,
          assigneeId: body.assigneeId,
        });
        return context.json({ data: request }, 201);
      } catch (error) {
        const failure = errorResponse(error);
        return context.json(failure.body, failure.status);
      }
    });

    router.get('/service-requests/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isSafeInteger(id) || id <= 0) {
        return context.json(
          { error: 'not-found', message: 'Service request was not found.' },
          404,
        );
      }
      const request = await service.get(id);
      if (!request) {
        return context.json(
          { error: 'not-found', message: 'Service request was not found.' },
          404,
        );
      }
      return context.json({ data: request });
    });

    router.post('/service-requests/:id/accept', async (context) => {
      try {
        const outcome = await service.accept(Number(context.req.param('id')));
        return context.json({ data: outcome });
      } catch (error) {
        const failure = errorResponse(error);
        return context.json(failure.body, failure.status);
      }
    });

    return router;
  });

export default serviceRequestApiRoutes;
