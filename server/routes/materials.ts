import type { Application } from '@nocobase/app-server/application';
import type { RepositoryPolicy } from '@nocobase/db';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { HTTPException } from 'hono/http-exception';
import { Hono, type Context } from 'hono';

import {
  MATERIAL_ACCESS_PATH,
  MATERIAL_FILE_COLLECTION,
  MaterialError,
  materialServiceToken,
  parseMaterialFileToken,
  type MaterialErrorCode,
} from '../providers/materials.js';

// HTTP surface for project materials and their attachments.
//
// Two security boundaries are installed here rather than inherited:
//
// 1. A root guard in front of the file plugin's public byte route. That route
//    serves any UUID to anyone, so a request for an attachment is checked for
//    the owning session before it runs.
// 2. An upload guard in front of the file plugin's `:uploadOne`/`:uploadMany`
//    actions. Without it an anonymous upload reaches the plugin, which answers
//    403 for a missing principal instead of the 401 the API promises.
//
// The CRUD endpoints below are their own sub-router with their own
// `auth.required()`, so nothing here depends on another contribution being
// registered or on the order they happen to be mounted in.

/** HTTP status for each stable service failure code. */
function statusForCode(code: MaterialErrorCode): 400 | 403 | 404 {
  switch (code) {
    case 'MATERIAL_FORBIDDEN':
    case 'MATERIAL_FILE_FORBIDDEN':
      return 403;
    case 'MATERIAL_NOT_FOUND':
    case 'MATERIAL_FILE_NOT_FOUND':
      return 404;
    default:
      return 400;
  }
}

/** Reads the authenticated user id, or `undefined` if the session is missing. */
function currentUserId(context: Context): string | undefined {
  const auth = context.get('auth');
  const id = auth?.user?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** Parses a JSON object body, answering `undefined` for anything else. */
async function readJsonObject(
  context: Context,
): Promise<Record<string, unknown> | undefined> {
  let value: unknown;
  try {
    value = await context.req.json();
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function invalidBody(context: Context): Response {
  return context.json(
    { code: 'MATERIAL_INVALID_BODY', message: 'Expected a JSON object body.' },
    400,
  );
}

/**
 * The CRUD sub-router, mounted at `/materials`.
 *
 * Returns the router it owns so the security boundary lives inside the thing
 * under test rather than being applied to a router passed in by a caller.
 */
export function createMaterialApiRouter(app: Application): Hono {
  const routes = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const materials = app.container.resolve(materialServiceToken);

  routes.use('*', auth.required());
  routes.onError((error, context) => {
    if (error instanceof MaterialError) {
      return context.json(
        { code: error.code, message: error.message },
        statusForCode(error.code),
      );
    }
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    throw error;
  });

  routes.get('/', async (context) => {
    const userId = currentUserId(context);
    if (!userId) {
      return context.json({ code: 'UNAUTHORIZED' }, 401);
    }
    return context.json({ data: await materials.list(userId) });
  });

  routes.post('/', async (context) => {
    const userId = currentUserId(context);
    if (!userId) {
      return context.json({ code: 'UNAUTHORIZED' }, 401);
    }
    const body = await readJsonObject(context);
    if (!body) {
      return invalidBody(context);
    }
    const material = await materials.create(userId, body);
    return context.json({ data: material }, 201);
  });

  routes.get('/:id', async (context) => {
    const userId = currentUserId(context);
    if (!userId) {
      return context.json({ code: 'UNAUTHORIZED' }, 401);
    }
    return context.json({
      data: await materials.detail(userId, context.req.param('id')),
    });
  });

  routes.patch('/:id', async (context) => {
    const userId = currentUserId(context);
    if (!userId) {
      return context.json({ code: 'UNAUTHORIZED' }, 401);
    }
    const body = await readJsonObject(context);
    if (!body) {
      return invalidBody(context);
    }
    return context.json({
      data: await materials.update(userId, context.req.param('id'), body),
    });
  });

  routes.delete('/:id', async (context) => {
    const userId = currentUserId(context);
    if (!userId) {
      return context.json({ code: 'UNAUTHORIZED' }, 401);
    }
    await materials.remove(userId, context.req.param('id'));
    return context.body(null, 204);
  });

  return routes;
}

/**
 * Root guard for the file plugin's public attachment byte route.
 *
 * The byte route is deliberately unauthenticated in the plugin, so this runs
 * first in the application's own route list and decides before it. The last
 * path segment carries `<uuid>[.<ext>]`; a wildcard route has no named param,
 * so it is read from the path rather than from `context.req.param`.
 */
export const materialContentGuard: AppRootRouteContribution<Application> =
  defineRootRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const materials = app.container.resolve(materialServiceToken);

    router.use(`${MATERIAL_ACCESS_PATH}/*`, auth.required(), async (context, next) => {
      const path = context.req.path;
      const token = path.slice(path.lastIndexOf('/') + 1);
      const fileId = parseMaterialFileToken(token);
      if (!fileId) {
        return context.json(
          { code: 'MATERIAL_FILE_NOT_FOUND', message: 'File not found.' },
          404,
        );
      }
      const userId = currentUserId(context);
      if (!userId) {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      const access = await materials.checkFileAccess(userId, fileId);
      if (access === 'missing') {
        return context.json(
          { code: 'MATERIAL_FILE_NOT_FOUND', message: 'File not found.' },
          404,
        );
      }
      if (access === 'denied') {
        return context.json(
          {
            code: 'MATERIAL_FILE_FORBIDDEN',
            message: 'This file belongs to another user.',
          },
          403,
        );
      }
      await next();
    });

    return router;
  });

/**
 * API guard for the file plugin's upload actions.
 *
 * `/materialFiles:uploadOne` and `/materialFiles:uploadMany` are the only
 * actions exposed for this Collection, so nothing else needs covering.
 */
export const materialUploadGuard: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    for (const action of ['uploadOne', 'uploadMany']) {
      router.use(
        `/${encodeURIComponent(MATERIAL_FILE_COLLECTION)}:${action}`,
        auth.required(),
      );
    }
    return router;
  });

interface MaterialUploadPrincipal {
  readonly userId: string;
}

/**
 * The file plugin exposures this application publishes.
 *
 * Only `uploadOne`/`uploadMany` are listed, so the plugin generates no
 * Collection read/create/update/delete endpoints for `material_files`. Uploads
 * are stamped with the caller through the Policy's `create.defaults`, and the
 * byte route stays the plugin's own (deliberately public) one, guarded above.
 */
export const materialFileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes<MaterialUploadPrincipal | null>({
    repositories: [
      {
        name: MATERIAL_FILE_COLLECTION,
        collection: MATERIAL_FILE_COLLECTION,
        disk: 'local',
        accessPath: MATERIAL_ACCESS_PATH,
        actions: { uploadOne: {}, uploadMany: {} },
        policy: (principal): RepositoryPolicy => ({
          read: false,
          create: {
            scope: true,
            defaults: { createdById: principal?.userId ?? '' },
          },
          update: false,
          delete: false,
        }),
      },
    ],
    principal: (context) => {
      const id = currentUserId(context);
      return id ? { userId: id } : null;
    },
  });