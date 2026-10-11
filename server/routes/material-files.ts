import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { FileRepositoryApiExposure } from '@nocobase/app-plugin-file/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import type { Context } from 'hono';

/**
 * Where the private bytes of a material attachment are served.
 *
 * A file's `contentUrl` is this path plus its id. The route serves the bytes to anyone holding the URL — that is the
 * file plugin's deliberate exception — so `server/middleware/material-access.ts` puts an owner check in front of it.
 */
export const MATERIAL_FILES_ACCESS_PATH = '/uploads/materials';

/** The signed-in user a policy is resolved against: the file plugin only needs the id. */
interface Principal {
  readonly id: string;
}

const exposure: FileRepositoryApiExposure<Principal> = {
  name: 'materialFiles',
  collection: 'material_files',
  disk: 'local',
  accessPath: MATERIAL_FILES_ACCESS_PATH,
  // Read scopes to the uploader; uploads stamp the uploader onto the new row, so a client can never choose an owner.
  // Update and delete stay closed here — attaching a file to a material is this application's own route.
  policy: (principal) => ({
    read: { scope: { ownerId: principal.id } },
    create: {
      scope: { ownerId: principal.id },
      defaults: { ownerId: principal.id },
    },
    update: false,
    delete: false,
  }),
  actions: { uploadOne: {} },
};

/**
 * The upload endpoint (`POST /api/materialFiles/uploadOne`).
 *
 * Authentication is enforced by the application on the whole `materialFiles` prefix, and the exposure's policy scopes
 * every row it writes to the caller. The byte route under `accessPath` is guarded separately.
 */
export const materialFileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes<Principal>({
    repositories: [exposure],
    principal: (context: Context) =>
      (context as Context<AuthEnv>).get('auth')?.user as unknown as Principal,
  });
