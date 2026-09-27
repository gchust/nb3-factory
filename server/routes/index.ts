import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { AuthSession } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { buildRepositoryPolicy } from '@nocobase/db';
import {
  PROJECT_MATERIAL_FILES_ACCESS_PATH,
  PROJECT_MATERIAL_FILES_COLLECTION,
  PROJECT_MATERIAL_FILES_RESOURCE,
} from '../providers/project-materials.js';
import { projectMaterialsApiRoutes } from './project-materials.js';

/**
 * The columns `@nocobase/app-plugin-file` requires of a file Collection. The
 * plugin substitutes its own copy for the upload path; this list exists so the
 * Policy an application reader sees is complete and honest.
 */
const FILE_FIELDS = [
  'id',
  'disk',
  'key',
  'filename',
  'ext',
  'mimeType',
  'size',
  'createdAt',
  'updatedAt',
] as const;

interface ProjectMaterialFilePrincipal {
  userId: string;
}

/**
 * Attachment uploads.
 *
 * The exposure deliberately enables `uploadOne` alone. With no other action,
 * `defineRepositoryApiRoutes` skips the CRUD router entirely, so a caller can
 * upload a file but cannot enumerate, edit or delete file metadata over HTTP.
 * Detaching an attachment goes through the material endpoint, which owns the
 * ownership rules.
 *
 * The principal comes from the session the authentication middleware set.
 * Anonymous callers resolve to `null` and the plugin answers 403 before any
 * bytes are stored; the `ownerId` default is what keeps an uploaded file
 * attributable to its uploader before it belongs to a material.
 *
 * The bytes themselves are served from a separate public root route, which the
 * plugin does not authenticate. `createProjectMaterialFileAccessMiddleware`
 * narrows that route to the owner.
 */
const projectMaterialFileRoutes =
  defineFileRepositoryApiRoutes<ProjectMaterialFilePrincipal | null>({
    principal: (context) => {
      const session = context.get('auth') as AuthSession | undefined;
      const userId = session?.user?.id;
      return userId ? { userId: String(userId) } : null;
    },
    repositories: [
      {
        name: PROJECT_MATERIAL_FILES_RESOURCE,
        collection: PROJECT_MATERIAL_FILES_COLLECTION,
        disk: 'local',
        accessPath: PROJECT_MATERIAL_FILES_ACCESS_PATH,
        accessMode: 'stream',
        policy: (principal) =>
          buildRepositoryPolicy((policy) =>
            policy
              .read(true)
              .create((create) =>
                create
                  .scope(true)
                  .fields(...FILE_FIELDS)
                  .defaults({ ownerId: principal?.userId ?? '' }),
              )
              .update(false)
              .delete(false),
          ),
        actions: {
          uploadOne: { maxSize: 20 * 1024 * 1024 },
        },
      },
    ],
  });

const routes: readonly AppRouteContribution<Application>[] = [
  ...projectMaterialFileRoutes,
  projectMaterialsApiRoutes,
];

export default routes;
