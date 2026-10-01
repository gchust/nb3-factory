import { Hono } from 'hono';
import type { Context } from 'hono';

import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';

import {
  ProjectMaterialError,
  projectMaterialServiceToken,
  type ProjectMaterialInput,
} from '../providers/project-material.js';

function respondWithError(context: Context<AuthEnv>, error: unknown): Response {
  if (error instanceof ProjectMaterialError) {
    return context.json(
      { error: { code: error.code, message: error.message } },
      error.status === 404 ? 404 : 400,
    );
  }
  throw error;
}

function userIdOf(context: Context<AuthEnv>): string {
  const auth = context.get('auth');
  if (!auth) {
    throw new Error(
      'The authentication middleware did not populate the session.',
    );
  }
  return auth.user.id;
}

async function readBody(
  context: Context<AuthEnv>,
): Promise<ProjectMaterialInput> {
  try {
    const body = await context.req.json<ProjectMaterialInput>();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return {};
    }
    return body;
  } catch {
    return {};
  }
}

/**
 * Application-owned routes because the file plugin's byte route is deliberately public. A private
 * attachment must be served only to the contributor who owns it, which means an authenticated route
 * the file plugin does not provide, so the application owns both the CRUD and the attachment
 * surface, and scopes every read and write by the session's user id.
 */
export const projectMaterialsRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(projectMaterialServiceToken);
    const required = auth.required();

    router.get('/project-materials', required, async (context) => {
      const data = await service.list(userIdOf(context));
      return context.json({ data });
    });

    router.post('/project-materials', required, async (context) => {
      try {
        const data = await service.create(
          userIdOf(context),
          await readBody(context),
        );
        return context.json({ data }, 201);
      } catch (error) {
        return respondWithError(context, error);
      }
    });

    router.get('/project-materials/:id', required, async (context) => {
      try {
        const data = await service.get(
          userIdOf(context),
          context.req.param('id'),
        );
        return context.json({ data });
      } catch (error) {
        return respondWithError(context, error);
      }
    });

    router.put('/project-materials/:id', required, async (context) => {
      try {
        const data = await service.update(
          userIdOf(context),
          context.req.param('id'),
          await readBody(context),
        );
        return context.json({ data });
      } catch (error) {
        return respondWithError(context, error);
      }
    });

    router.delete('/project-materials/:id', required, async (context) => {
      try {
        await service.remove(userIdOf(context), context.req.param('id'));
        return context.json({ data: { deleted: true } });
      } catch (error) {
        return respondWithError(context, error);
      }
    });

    return router as unknown as Hono;
  });

export default projectMaterialsRoutes;
