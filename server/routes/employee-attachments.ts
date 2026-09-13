import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  EMPLOYEE_FILE_ACCESS_PATH,
  EMPLOYEE_FILE_COLLECTION,
  EMPLOYEE_FILE_DISK,
  EMPLOYEE_FILE_RESOURCE,
} from '../providers/employee-records.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Certificate attachment upload and content routes from the File plugin.
 *
 * The plugin's routes are public by design; this application owns the policy. Both contributions — the `/api` upload
 * endpoints and the root content endpoint that serves the bytes — are wrapped so an anonymous request is rejected
 * with 401 before any storage or metadata work happens.
 */
const fileContributions = defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: EMPLOYEE_FILE_RESOURCE,
      collection: EMPLOYEE_FILE_COLLECTION,
      connection: 'main',
      disk: EMPLOYEE_FILE_DISK,
      accessPath: EMPLOYEE_FILE_ACCESS_PATH,
      accessMode: 'stream',
      actions: {
        uploadOne: { maxSize: MAX_UPLOAD_BYTES },
        uploadMany: { maxSize: MAX_UPLOAD_BYTES },
      },
    },
  ],
});

const employeeAttachmentRoutes: readonly AppRouteContribution<Application>[] =
  fileContributions.map(withAuthentication);

export default employeeAttachmentRoutes;

/**
 * Applies this application's authentication policy to one File-plugin contribution.
 *
 * The middleware must be scoped to the paths the File plugin actually owns. A bare `use('*')` on a root-scope
 * contribution is mounted at `/`, so it intercepts every root request — including the SPA document at the public base
 * path — and returns 401 before the application can render. The File plugin registers API actions under
 * `/<resource>:<action>` and the content route under `<accessPath>/:file`, so those prefixes are the whole surface.
 */
export function withAuthentication(
  contribution: AppRouteContribution<Application>,
): AppRouteContribution<Application> {
  const createRouter = async (app: Application): Promise<Hono> => {
    const auth = app.container.resolve(authenticationToken);
    const router = new Hono();
    if (contribution.scope === 'api') {
      router.use(
        `/${encodeURIComponent(EMPLOYEE_FILE_RESOURCE)}*`,
        auth.required(),
      );
    } else {
      router.use(EMPLOYEE_FILE_ACCESS_PATH, auth.required());
      router.use(`${EMPLOYEE_FILE_ACCESS_PATH}/*`, auth.required());
    }
    router.route('/', await contribution.createRouter(app));
    return router;
  };

  return contribution.scope === 'api'
    ? { createRouter, scope: 'api' }
    : { createRouter, scope: 'root' };
}
