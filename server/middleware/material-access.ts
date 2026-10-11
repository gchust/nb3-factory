import {
  authenticationToken,
  type AuthSession,
  type Auth,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  defineHttpMiddleware,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { Context, MiddlewareHandler } from 'hono';

import { MATERIAL_FILES_ACCESS_PATH } from '../routes/material-files.js';

/**
 * Guards the two private surfaces of the file plugin for material attachments.
 *
 * `POST /api/materialFiles/uploadOne` is the file plugin's own route, so it must be authenticated before it runs; the
 * exposure's Policy then scopes the row it writes to the caller. The byte route under `accessPath` deliberately serves
 * anyone holding the URL, so the owner check is put in front of it here: without a session it answers 401, and a file
 * that is missing or belongs to somebody else answers 404, which hides the difference between the two from a stranger.
 *
 * This runs before every route, including the plugin's, because it is mounted as an HTTP middleware on the root router
 * rather than as an API contribution that would be registered after the plugin's routes.
 */
export const materialAccessMiddleware = defineHttpMiddleware<Application>({
  name: '@nocobase/app/materials/access',
  register(router, app) {
    // An application assembled without the authentication plugin has nothing to guard; the routes it owns are not
    // mounted either. Skipping keeps such an assembly, which the runtime tests build, startable.
    if (!app.container.has(authenticationToken)) return;
    const auth = app.container.resolve(authenticationToken);

    router.use(
      '/api/materialFiles/*',
      auth.required() as unknown as MiddlewareHandler,
    );

    router.use(`${MATERIAL_FILES_ACCESS_PATH}/:file`, (async (
      context: Context,
      next: () => Promise<void>,
    ) => {
      const session = await readSession(auth, context.req.raw.headers);
      const ownerId = session?.user
        ? await findFileOwner(app, context.req.param('file'))
        : undefined;
      if (!session?.user || ownerId !== session.user.id) {
        return apiErrorHandler(
          new ApiError(
            session?.user
              ? {
                  status: 'NOT_FOUND',
                  reason: 'MATERIAL_FILE_NOT_FOUND',
                  domain: 'materials',
                  message: 'File not found.',
                }
              : {
                  status: 'UNAUTHENTICATED',
                  reason: 'AUTHENTICATION_REQUIRED',
                  domain: 'authentication',
                  message: 'Authentication required.',
                },
          ),
          context,
        );
      }
      await next();
    }) as unknown as MiddlewareHandler);
  },
});

async function readSession(auth: Auth, headers: Headers): Promise<AuthSession> {
  try {
    // A read must not extend the session it is only checking.
    return await auth.getSession(headers, { disableRefresh: true });
  } catch {
    return null;
  }
}

async function findFileOwner(
  app: Application,
  file: string | undefined,
): Promise<string | undefined> {
  if (!file) return undefined;
  // The route matches `id` and `id.ext`; a UUID never contains a dot.
  const id = file.split('.')[0];
  if (!id) return undefined;
  const record = await app.container
    .resolve(databaseManagerToken)
    .repository<{ id: string; ownerId: string }>('material_files')
    .findOne({ filter: { id } });
  return record?.ownerId;
}
