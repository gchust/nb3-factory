import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import {
  defineFileRepositoryApiRoutes,
  type FileRepositoryApiExposure,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  PROJECT_MATERIAL_FILES_ACCESS_PATH,
  PROJECT_MATERIAL_FILES_EXPOSURE,
  projectMaterialsServiceToken,
} from '../providers/project-materials.js';

/**
 * The columns the file plugin requires a file Collection to provide. The plugin does not export this list from its
 * package entry point, so it is repeated here; it is part of the plugin's file contract, not of this application.
 */
const FILE_COLUMNS = [
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

/** The largest single attachment. Photos from a phone and Word documents fit well inside this. */
const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

/** What the upload path's Policy is built from: the caller, resolved from the request's own session. */
interface ProjectMaterialFilePrincipal {
  readonly userId: string;
}

/**
 * The file endpoints for project material attachments, plus the public byte route the plugin adds.
 *
 * The plugin generates the upload endpoint and the byte route but adds no authentication of its own — its SKILL says
 * authentication is the application's to own — so each is wrapped here. The upload endpoint requires a session; its
 * Policy scopes every row it creates to `createdById` and stamps the caller onto it, and a principal that cannot be
 * resolved is refused by the plugin. The byte route requires a session and then the file's owner, answering 404 to
 * anyone else so a foreign id is indistinguishable from a missing one.
 *
 * Both wrappers are the first handler on the paths they cover, and their middleware calls `next()`, so the plugin's
 * own handler still runs. Nothing else mounts under these prefixes.
 */
function withUploadAuth(
  contribution: AppRouteContribution<Application>,
): AppApiRouteContribution<Application> {
  if (contribution.scope !== 'api') {
    throw new Error('The file upload routes are expected in the API scope.');
  }
  return defineApiRoutes(async (app) => {
    const inner = await contribution.createRouter(app);
    const outer = new Hono();
    outer.use(
      `/${PROJECT_MATERIAL_FILES_EXPOSURE}/*`,
      app.container.resolve(authenticationToken).required(),
    );
    outer.route('/', inner);
    return outer;
  });
}

function withContentGuard(
  contribution: AppRouteContribution<Application>,
): AppRootRouteContribution<Application> {
  if (contribution.scope !== 'root') {
    throw new Error('The file content route is expected in the root scope.');
  }
  return defineRootRoutes(async (app) => {
    const inner = await contribution.createRouter(app);
    const materials = app.container.resolve(projectMaterialsServiceToken);
    const outer = new Hono();
    outer.use(
      `${PROJECT_MATERIAL_FILES_ACCESS_PATH}/:file`,
      app.container.resolve(authenticationToken).required(),
      async (context, next) => {
        const user = (context as Context<AuthEnv>).get('auth')?.user;
        // `:file` is `{id}.{ext}`; the id never contains a dot.
        const fileParam = context.req.param('file') ?? '';
        const dot = fileParam.indexOf('.');
        const fileId = dot === -1 ? fileParam : fileParam.slice(0, dot);
        if (!user || !(await materials.ownsFile(user.id, fileId))) {
          return context.notFound();
        }
        await next();
      },
    );
    outer.route('/', inner);
    return outer;
  });
}

const contributions =
  defineFileRepositoryApiRoutes<ProjectMaterialFilePrincipal>({
    repositories: [
      {
        name: PROJECT_MATERIAL_FILES_EXPOSURE,
        collection: PROJECT_MATERIAL_FILES_EXPOSURE,
        connection: 'main',
        disk: 'local',
        accessPath: PROJECT_MATERIAL_FILES_ACCESS_PATH,
        accessMode: 'stream',
        // The caller may create rows, and only rows that are the caller's own: `scope` is checked against the row and
        // `defaults` stamps the caller onto it, so an upload can never be attributed to anyone else. Reading, updating
        // and deleting file rows through these endpoints is not offered; a material's endpoints own that, and removal
        // unlinks rather than deletes.
        policy: ({ userId }) => ({
          read: false,
          create: {
            scope: { createdById: userId },
            defaults: { createdById: userId },
            fields: [...FILE_COLUMNS],
          },
          update: false,
          delete: false,
        }),
        actions: { uploadOne: { maxSize: UPLOAD_MAX_BYTES } },
      } satisfies FileRepositoryApiExposure<ProjectMaterialFilePrincipal>,
    ],
    principal: (context) => {
      const user = (context as Context<AuthEnv>).get('auth')?.user;
      if (!user) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'AUTHENTICATION_REQUIRED',
          domain: 'projectMaterials',
          message: 'A signed-in user is required to upload an attachment.',
        });
      }
      return { userId: user.id };
    },
  });

export const projectMaterialFileRoutes: readonly AppRouteContribution<Application>[] =
  contributions.map((contribution) =>
    contribution.scope === 'api'
      ? withUploadAuth(contribution)
      : withContentGuard(contribution),
  );
