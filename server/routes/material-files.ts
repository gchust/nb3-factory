import type { Application } from '@nocobase/app-server/application';
import type {
  AppApiRouteContribution,
  AppRootRouteContribution,
  AppRouteContribution,
} from '@nocobase/app-server/router';
import {
  ApiError,
  apiErrorHandler,
  defineApiRoutes,
  defineRootRoutes,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  defineFileRepositoryApiRoutes,
  type FileRepositoryApiExposure,
} from '@nocobase/app-plugin-file/server';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import {
  MATERIAL_FILE_ACCESS_PATH,
  PROJECT_MATERIAL_FILES_COLLECTION,
} from '../providers/material-service.js';

/**
 * The upload API and the byte route of the File plugin, with the authentication
 * and the ownership check the plugin deliberately leaves to the application.
 *
 * `defineFileRepositoryApiRoutes` registers its byte route at the application
 * root, outside `/api` and outside the Repository Policy that governs the data
 * endpoints: the plugin's documentation states that route "serves anyone
 * holding the UUID, has no authentication of its own, and is unaffected by this
 * Policy". A private material therefore needs its own boundary in front of it,
 * which is what this contribution adds. Every request below the exposure path
 * must carry a session, and the file it names must belong to that session.
 * `authentication.required()` runs first, so an anonymous caller is answered
 * `401` before the ownership of any id is even looked up, and a file that
 * exists but belongs to someone else is answered `404` rather than `403`, so a
 * guessed id cannot confirm that it exists.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The columns the File plugin writes, plus the two this application adds. */
const FILE_COLUMNS = [
  'id',
  'disk',
  'key',
  'filename',
  'ext',
  'mimeType',
  'size',
  'ownerId',
  'materialId',
  'createdAt',
  'updatedAt',
];

interface Principal {
  readonly id: string;
}

/**
 * The upload API and the byte route have no session of their own; both are
 * wrapped by middleware that has already put one on the request's Context, so
 * this never runs unresolved. It still throws rather than resolving to an empty
 * principal, because an empty principal would stamp an empty `ownerId`.
 */
function principalOf(context: Context): Principal {
  const session = (context as Context<AuthEnv>).get('auth');
  if (!session?.user) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTHENTICATION_REQUIRED',
      domain: 'authentication',
      message: 'Authentication required.',
    });
  }
  return { id: session.user.id };
}

function fileContributions(
  app: Application,
): readonly AppRouteContribution<Application>[] {
  const disk = app.config.get<string>('drive.default') ?? 'local';
  const exposure: FileRepositoryApiExposure<Principal> = {
    name: PROJECT_MATERIAL_FILES_COLLECTION,
    collection: PROJECT_MATERIAL_FILES_COLLECTION,
    accessPath: MATERIAL_FILE_ACCESS_PATH,
    disk,
    accessMode: 'stream',
    policy: (principal) => ({
      // An upload inherits this `create` scope and the `ownerId` the server
      // stamps on each row; `uploadPolicy` replaces the read allowlist with the
      // file columns. There is no CRUD action to reach `update` or `delete`,
      // and neither is granted.
      read: {
        scope: { ownerId: principal.id },
        fields: FILE_COLUMNS,
      },
      create: { scope: true, defaults: { ownerId: principal.id } },
      update: false,
      delete: false,
    }),
    actions: { uploadOne: {}, uploadMany: {} },
  };
  return defineFileRepositoryApiRoutes<Principal>({
    repositories: [exposure],
    principal: principalOf,
  });
}

/** Rejects a byte request for a file this session does not own. */
function requireFileOwner(app: Application): MiddlewareHandler<AuthEnv> {
  const database = app.container.resolve(databaseManagerToken);
  return async (context, next) => {
    const fileId = parseFileId(context.req.path);
    const record = fileId
      ? await database
          .repository<{ id: string; ownerId: string }>(
            PROJECT_MATERIAL_FILES_COLLECTION,
          )
          .findOne({ filter: { id: fileId } })
      : undefined;
    if (!record || record.ownerId !== context.get('auth')?.user?.id) {
      return apiErrorHandler(
        new ApiError({
          status: 'NOT_FOUND',
          reason: 'MATERIAL_FILE_NOT_FOUND',
          domain: 'projectMaterials',
          message: 'This attachment does not exist.',
        }),
        context,
      );
    }
    await next();
  };
}

/** The file id at the end of the exposure path, with or without its extension. */
function parseFileId(path: string): string | undefined {
  const prefix = `${MATERIAL_FILE_ACCESS_PATH}/`;
  if (!path.startsWith(prefix)) {
    return undefined;
  }
  const rest = path.slice(prefix.length);
  if (rest.includes('/')) {
    return undefined;
  }
  const dot = rest.indexOf('.');
  const id = dot === -1 ? rest : rest.slice(0, dot);
  return UUID_PATTERN.test(id) ? id : undefined;
}

/** Uploads, authenticated before the File plugin's own router sees the request. */
export const materialFileApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    // `authentication.required()` is typed against the authentication plugin's
    // environment; a contribution's router is a plain Hono router and shares
    // the request's Context with every router mounted into it.
    router.use(
      `${MATERIAL_FILE_ACCESS_PATH}/*`,
      authentication.required() as MiddlewareHandler,
    );
    const [api] = fileContributions(app);
    router.route('/', await api.createRouter(app));
    return router;
  });

/** Attachment bytes, authenticated and restricted to the owning session. */
export const materialFileRootRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes(async (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    router.use(
      `${MATERIAL_FILE_ACCESS_PATH}/*`,
      authentication.required() as MiddlewareHandler,
      requireFileOwner(app) as MiddlewareHandler,
    );
    const [, root] = fileContributions(app);
    router.route('/', await root.createRouter(app));
    return router;
  });
