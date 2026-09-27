import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  authenticationToken,
  type AuthEnv,
  type AuthSession,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { defineHttpMiddleware } from '@nocobase/app-server/router';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import {
  PROJECT_MATERIAL_FILES_ACCESS_PATH,
  PROJECT_MATERIAL_FILES_COLLECTION,
  PROJECT_MATERIAL_FILES_RESOURCE,
  type ProjectMaterialFileRecord,
} from '../providers/project-materials.js';

/**
 * The file plugin serves attachment bytes from a public root route that any
 * holder of the UUID can read. The requirement is the opposite: an attachment
 * belongs to one account and a second signed-in user must not be able to open
 * it even with the exact URL. This application-owned middleware sits in front
 * of that route and narrows it to the owner.
 *
 * The middleware is registered through `app.addHttpMiddleware`, so it runs
 * before every route contribution. A root-scope route contribution could not
 * do this: the plugin's route is mounted earlier and would win.
 *
 * `authenticationToken` is resolved per request rather than at registration
 * time, so an application that composes its router without the authentication
 * plugin still starts; only these paths would then fail, and only when called.
 */
const FILE_ACCESS_ROUTE = `${PROJECT_MATERIAL_FILES_ACCESS_PATH}/:file`;
const UPLOAD_ROUTE = `/api/${PROJECT_MATERIAL_FILES_RESOURCE}:uploadOne`;

/** `uuid` or `uuid.ext`, matching the byte route the plugin actually serves. */
const FILE_PARAM = /^([0-9a-f-]{36})(?:\.([a-z0-9]{1,32}))?$/;

export function createProjectMaterialFileAccessMiddleware(
  app: Application,
): ReturnType<typeof defineHttpMiddleware<Application>> {
  const requireAuth: MiddlewareHandler = (context, next) => {
    const auth = app.container.resolve(authenticationToken);
    // The middleware writes `auth` onto the context for the handlers after it.
    return auth.required()(context as Context<AuthEnv, string>, next);
  };

  const ownerOnly: MiddlewareHandler = async (context, next) => {
    const session = context.get('auth') as AuthSession;
    const userId = session?.user?.id;
    if (!userId) return context.notFound();

    const match = FILE_PARAM.exec(context.req.param('file') ?? '');
    if (!match) return context.notFound();

    const database: DatabaseManager =
      app.container.resolve(databaseManagerToken);
    const record = await database
      .repository<ProjectMaterialFileRecord>(PROJECT_MATERIAL_FILES_COLLECTION)
      .findOne({ filter: { id: match[1] } });
    if (!record || String(record.ownerId) !== String(userId)) {
      // Not found rather than forbidden: the caller learns nothing about
      // whether someone else's attachment exists.
      return context.notFound();
    }
    return next();
  };

  return defineHttpMiddleware<Application>({
    name: 'project-material-file-access',
    register(router: Hono): void {
      router.use(FILE_ACCESS_ROUTE, requireAuth, ownerOnly);
      router.use(UPLOAD_ROUTE, requireAuth);
    },
  });
}
