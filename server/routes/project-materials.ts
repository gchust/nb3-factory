import {
  authenticationToken,
  type AuthSession,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import {
  ProjectMaterialInputError,
  projectMaterialsServiceToken,
  type ProjectMaterialInput,
  type ProjectMaterialsService,
} from '../providers/project-materials.js';

export const PROJECT_MATERIALS_PREFIX = '/project-materials';

function currentUserId(context: Context): string | undefined {
  return (context.get('auth') as AuthSession)?.user?.id;
}

function unauthorized(context: Context): Response {
  return context.json(
    { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    401,
  );
}

function notFound(context: Context): Response {
  return context.json(
    { code: 'NOT_FOUND', message: 'Material not found.' },
    404,
  );
}

async function readInput(context: Context): Promise<ProjectMaterialInput> {
  try {
    const body: unknown = await context.req.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

function handleInputError(context: Context, error: unknown): Response {
  if (error instanceof ProjectMaterialInputError) {
    return context.json({ code: error.code, message: error.message }, 400);
  }
  throw error;
}

/**
 * The application-owned material endpoints. Every handler resolves the
 * signed-in user from the session the authentication middleware set and passes
 * it to the service, which scopes each query by owner. An endpoint therefore
 * never confirms the existence of another account's material.
 */
export function createProjectMaterialsRouter(app: Application): Hono {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const service: ProjectMaterialsService = app.container.resolve(
    projectMaterialsServiceToken,
  );
  const requireAuth = auth.required();

  router.use(PROJECT_MATERIALS_PREFIX, requireAuth);
  router.use(`${PROJECT_MATERIALS_PREFIX}/*`, requireAuth);

  router.get(PROJECT_MATERIALS_PREFIX, async (context) => {
    const userId = currentUserId(context);
    if (!userId) return unauthorized(context);
    return context.json({ data: await service.list(userId) });
  });

  router.post(PROJECT_MATERIALS_PREFIX, async (context) => {
    const userId = currentUserId(context);
    if (!userId) return unauthorized(context);
    const input = await readInput(context);
    try {
      return context.json({ data: await service.create(userId, input) }, 201);
    } catch (error) {
      return handleInputError(context, error);
    }
  });

  router.get(`${PROJECT_MATERIALS_PREFIX}/:id`, async (context) => {
    const userId = currentUserId(context);
    if (!userId) return unauthorized(context);
    const view = await service.get(userId, context.req.param('id'));
    return view ? context.json({ data: view }) : notFound(context);
  });

  router.patch(`${PROJECT_MATERIALS_PREFIX}/:id`, async (context) => {
    const userId = currentUserId(context);
    if (!userId) return unauthorized(context);
    const input = await readInput(context);
    try {
      const view = await service.update(userId, context.req.param('id'), input);
      return view ? context.json({ data: view }) : notFound(context);
    } catch (error) {
      return handleInputError(context, error);
    }
  });

  return router;
}

export const projectMaterialsApiRoutes = defineApiRoutes(
  createProjectMaterialsRouter,
);
