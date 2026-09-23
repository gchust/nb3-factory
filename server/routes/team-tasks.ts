import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationScope,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  isTeamTaskStatus,
  parseTeamTaskId,
  TEAM_TASK_MANAGE_ACTION,
  TEAM_TASK_RESOURCE,
  TeamTaskValidationError,
  teamTaskServiceToken,
  type TeamTaskStatus,
} from '../providers/team-tasks.js';

/**
 * Every signed-in user may read the checklist. Creating, editing and marking a
 * task complete all use the application's `teamTasks.manage` business action,
 * which only the unrestricted root permission set holds by default — so the
 * server rejects writes from ordinary members even though the client hides the
 * controls for them.
 */
export const teamTaskApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const tasks = app.container.resolve(teamTaskServiceToken);

    routes.use('*', authentication.required(), authorization.middleware());

    routes.get('/', async (context) => {
      const statusParam = context.req.query('status');
      let status: TeamTaskStatus | undefined;
      if (statusParam !== undefined && statusParam !== '') {
        if (!isTeamTaskStatus(statusParam)) {
          return context.json({ code: 'INVALID_STATUS' }, 400);
        }
        status = statusParam;
      }

      return context.json({
        data: await tasks.list(status ? { status } : undefined),
        canManage: await canManage(context),
      });
    });

    routes.post('/', async (context) => {
      if (!(await canManage(context))) {
        return context.json({ code: 'FORBIDDEN' }, 403);
      }
      const body = await readJsonObject(context);
      if (!body) {
        return context.json({ code: 'INVALID_BODY' }, 400);
      }

      try {
        const task = await tasks.create({
          title: body.title,
          notes: body.notes,
        });
        return context.json({ data: task }, 201);
      } catch (error: unknown) {
        return handleValidationError(context, error);
      }
    });

    routes.patch('/:id', async (context) => {
      if (!(await canManage(context))) {
        return context.json({ code: 'FORBIDDEN' }, 403);
      }
      const id = parseTeamTaskId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'INVALID_ID' }, 400);
      }
      const body = await readJsonObject(context);
      if (!body) {
        return context.json({ code: 'INVALID_BODY' }, 400);
      }

      try {
        const task = await tasks.update(id, {
          title: body.title,
          notes: body.notes,
          status: body.status,
        });
        if (!task) {
          return context.json({ code: 'NOT_FOUND' }, 404);
        }
        return context.json({ data: task });
      } catch (error: unknown) {
        return handleValidationError(context, error);
      }
    });

    router.route('/team-tasks', routes);
    return router;
  });

async function canManage(context: Context): Promise<boolean> {
  const authz = context.get('authz') as AuthorizationScope;
  return authz.can({
    resource: { type: 'resource', id: TEAM_TASK_RESOURCE },
    action: TEAM_TASK_MANAGE_ACTION,
  });
}

async function readJsonObject(
  context: Context,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await context.req.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return undefined;
    }
    return body as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function handleValidationError(context: Context, error: unknown): Response {
  if (error instanceof TeamTaskValidationError) {
    return context.json(
      { code: 'VALIDATION_FAILED', message: error.message },
      400,
    );
  }
  throw error;
}
