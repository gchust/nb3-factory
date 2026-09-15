import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import type {
  AppRouteContribution,
  AppRouterFactory,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';

import {
  ensureInspectionRoles,
  resolveUserRole,
  type ResolvedRole,
} from '../providers/inspection-roles.js';

export const INSPECTION_PHOTOS_RESOURCE = 'inspectionPhotos';
export const INSPECTION_PHOTOS_COLLECTION = 'inspectionFiles';
export const INSPECTION_PHOTOS_ACCESS_PATH = '/uploads/inspection-photos';
export const MAX_PHOTO_BYTES: number = 5 * 1024 * 1024;
export const MAX_PHOTO_BATCH_BYTES: number = 20 * 1024 * 1024;

const UPLOAD_SUFFIXES = [':uploadOne', ':uploadMany'];

/**
 * The File plugin's repository routes are public by design; the application
 * owns their security. Every route here requires a session, and the upload
 * actions additionally require a role that may create inspection records.
 * Content is readable by any signed-in user because the record they belong to
 * is already visible to that user; the record routes enforce the finer scope.
 */
export function createInspectionFileRoutes(): readonly AppRouteContribution<Application>[] {
  const contributions = defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: INSPECTION_PHOTOS_RESOURCE,
        collection: INSPECTION_PHOTOS_COLLECTION,
        disk: 'local',
        accessPath: INSPECTION_PHOTOS_ACCESS_PATH,
        accessMode: 'stream',
        actions: {
          findMany: { maxLimit: 100 },
          findOne: {},
          uploadOne: { maxSize: MAX_PHOTO_BYTES },
          uploadMany: { maxSize: MAX_PHOTO_BATCH_BYTES },
        },
      },
    ],
  });

  return contributions.map((contribution) => ({
    scope: contribution.scope,
    createRouter: wrapContribution(contribution),
  }));
}

function wrapContribution(
  contribution: AppRouteContribution<Application>,
): AppRouterFactory<Application> {
  return async (app) => {
    const auth = app.container.resolve(authenticationToken);
    const inner = await contribution.createRouter(app);
    const router = new Hono<AuthEnv>();
    // A `root` contribution is mounted at `/` *inside* the public base path,
    // so `use('*')` here would intercept every request below the base path —
    // including the SPA entry — and answer 401 before the client ever loads.
    // Only an `api` contribution is isolated by its `/api` mount; a root one
    // must name the access path it actually owns.
    const securedScope =
      contribution.scope === 'api' ? '*' : `${INSPECTION_PHOTOS_ACCESS_PATH}/*`;
    router.use(securedScope, auth.required());
    if (contribution.scope === 'api') {
      const authorization = app.container.resolve(authorizationToken);
      router.use('*', uploadGuard(authorization));
    }
    router.route('/', inner);
    // The framework contribution is typed against the blank environment; the
    // router's AuthEnv only matters to the middleware registered above.
    return router as unknown as Hono;
  };
}

function uploadGuard(
  authorization: Parameters<typeof resolveUserRole>[0],
): MiddlewareHandler<AuthEnv> {
  const allowed: readonly ResolvedRole[] = ['admin', 'teamLead', 'inspector'];
  return async (context, next) => {
    if (!isUploadAction(context.req.path)) return next();
    const session = context.get('auth');
    const userId = session?.user?.id;
    if (!userId) return context.json({ code: 'UNAUTHORIZED' }, 401);
    await ensureInspectionRoles(authorization);
    const role = await resolveUserRole(authorization, userId);
    if (!allowed.includes(role)) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    await next();
  };
}

function isUploadAction(path: string): boolean {
  return UPLOAD_SUFFIXES.some((suffix) => path.endsWith(suffix));
}
