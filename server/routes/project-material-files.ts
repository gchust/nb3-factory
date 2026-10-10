import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import type { Context } from 'hono';
import { Hono } from 'hono';

import {
  PROJECT_MATERIAL_FILES_ACCESS_PATH,
  projectMaterialsServiceToken,
  type ProjectMaterialsService,
} from '../providers/project-materials.js';
import { currentUserId } from './current-user.js';

/**
 * The File plugin's upload and byte-serving routes, made application-owned.
 *
 * The plugin's routes are deliberately public: their byte route serves anyone
 * holding the URL, and its upload path takes a Policy but installs no
 * authentication. This module wraps both contributions so that
 *
 * - every path under `PROJECT_MATERIAL_FILES_ACCESS_PATH` requires a signed-in
 *   session (401 for anonymous), including the byte route, and
 * - the byte route additionally answers `404` unless the file belongs to the
 *   caller, so another user's attachment id reveals nothing.
 *
 * Uploads inherit the caller's id as the record's `ownerId` through the
 * exposure's `create.defaults`, so a file cannot be created for someone else.
 */

const FILE_ID_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z0-9]{1,32})?$/u;

/** The file id in `/projectMaterialFiles/<id>[.<ext>]`, or `undefined`. */
function fileIdFromPath(pathname: string): string | undefined {
  // The plugin's byte route takes the id as a path parameter, and an outer
  // router cannot read the inner router's params, so read the last segment.
  const segment = pathname.split('/').pop() ?? '';
  return FILE_ID_PATTERN.exec(segment)?.[1];
}

const fileContributions = defineFileRepositoryApiRoutes<{ id: string }>({
  // Runs after `auth.required()` has put the session on the context, so the
  // upload Policy can be built from the caller rather than from the request
  // body. `auth.required()` guarantees a session, so a missing one is a
  // programming error rather than a case to handle.
  principal: (context: Context) => {
    const auth = (context as Context<AuthEnv>).get('auth');
    if (!auth) {
      throw new Error(
        'The file upload route is missing its authentication middleware.',
      );
    }
    return { id: auth.user.id };
  },
  repositories: [
    {
      name: 'projectMaterialFiles',
      collection: 'projectMaterialFiles',
      disk: 'local',
      accessPath: PROJECT_MATERIAL_FILES_ACCESS_PATH,
      policy: (principal) => ({
        // A file belongs to whoever uploaded it. The scope refuses a create
        // bound to another owner and the default stamps the caller's id, so a
        // caller cannot choose an owner.
        create: {
          scope: { ownerId: principal.id },
          defaults: { ownerId: principal.id },
        },
        // Only uploadOne is exposed below; the read policy is replaced by the
        // plugin's upload policy, which reads every file column.
        read: true,
        update: false,
        delete: false,
      }),
      // Nothing but the upload action. Material CRUD reads and links files
      // through the application's own service, not through a public Repository
      // exposure, so no find/create/update/delete endpoint exists.
      actions: { uploadOne: {} },
    },
  ],
});

function resolveAuth(app: Application) {
  return app.container.resolve(authenticationToken);
}

/** Adds `auth.required()` to every path the contribution answers. */
function wrapApiContribution(
  source: AppApiRouteContribution<Application>,
): AppApiRouteContribution<Application> {
  return defineApiRoutes(async (app) => {
    const inner = await source.createRouter(app);
    const auth = resolveAuth(app);
    // Typed with Hono's default environment so the contribution stays
    // assignable to the application's router factory. `auth.required()` still
    // sets `auth` on the shared context at runtime.
    const outer = new Hono();
    outer.use(`${PROJECT_MATERIAL_FILES_ACCESS_PATH}/*`, auth.required());
    outer.route('/', inner);
    return outer;
  });
}

/**
 * Adds `auth.required()` and the owner check to the byte route.
 *
 * The owner check answers `404` rather than `403` so that holding another
 * user's file id and not holding it are indistinguishable.
 */
function wrapRootContribution(
  source: AppRootRouteContribution<Application>,
): AppRootRouteContribution<Application> {
  return defineRootRoutes(async (app) => {
    const inner = await source.createRouter(app);
    const auth = resolveAuth(app);
    const service = app.container.resolve<ProjectMaterialsService>(
      projectMaterialsServiceToken,
    );
    const outer = new Hono();
    outer.use(`${PROJECT_MATERIAL_FILES_ACCESS_PATH}/*`, auth.required());
    outer.use(
      `${PROJECT_MATERIAL_FILES_ACCESS_PATH}/*`,
      // Annotated with Hono's default `Context` so the wildcard `use` overload
      // does not leak an `any` type argument into the owner check.
      async (context: Context, next) => {
        const fileId = fileIdFromPath(context.req.path);
        if (!fileId) return context.notFound();
        const owner = await service.findFileOwner(fileId);
        if (!owner || owner.ownerId !== currentUserId(context)) {
          return context.notFound();
        }
        await next();
      },
    );
    outer.route('/', inner);
    return outer;
  });
}

const apiSource = fileContributions.find((item) => item.scope === 'api');
const rootSource = fileContributions.find((item) => item.scope === 'root');
if (!apiSource || !rootSource) {
  throw new Error(
    'The file plugin did not provide the route contributions this module wraps.',
  );
}

export const projectMaterialFilesApiRoutes: AppApiRouteContribution<Application> =
  wrapApiContribution(apiSource);

export const projectMaterialFilesRootRoutes: AppRootRouteContribution<Application> =
  wrapRootContribution(rootSource);
