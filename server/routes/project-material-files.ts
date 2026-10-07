import {
  ApiError,
  appErrorDomain,
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthSession,
} from '@nocobase/app-plugin-authentication/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { databaseManagerToken, type RepositoryPolicy } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';

import {
  MATERIAL_FILE_ACCESS_PATH,
  MATERIAL_FILE_COLLECTION,
} from '../providers/project-materials.js';

/** The file columns a response may carry; never `key`, which is a storage detail. */
const FILE_READ_FIELDS = [
  'id',
  'filename',
  'ext',
  'mimeType',
  'size',
  'createdAt',
  'updatedAt',
] as const;

/** One signed-in user, as the file exposure's Policy receives it. */
interface MaterialFilePrincipal {
  readonly id: string;
}

/**
 * A caller sees and deletes only their own files. Uploads get their owner from the session — the
 * `create` scope and `defaults` stamp it, and the field allowlist is empty, so a caller cannot
 * choose an owner. Updates are refused outright: linking a file to a material is this
 * application's business, and it happens through the materials service.
 */
function materialFilePolicy(
  principal: MaterialFilePrincipal | null,
): RepositoryPolicy {
  if (!principal) {
    return { read: false, create: false, update: false, delete: false };
  }
  return {
    read: {
      scope: { ownerId: principal.id },
      fields: FILE_READ_FIELDS,
    },
    create: {
      scope: true,
      fields: [],
      defaults: { ownerId: principal.id },
    },
    update: false,
    delete: { scope: { ownerId: principal.id } },
  };
}

/**
 * The file plugin's routes, with the application's authentication and ownership on top. The plugin
 * ships services only; these routes are the application's, so the application guards them.
 *
 * Uploading files first and attaching them later is what makes a failed save recoverable: a file
 * exists, owned by its uploader, before any material does.
 */
const fileContributions =
  defineFileRepositoryApiRoutes<MaterialFilePrincipal | null>({
    principal: (context) => {
      const session = context.get('auth') as AuthSession | undefined;
      const id = session?.user?.id;
      return typeof id === 'string' && id.length > 0 ? { id } : null;
    },
    repositories: [
      {
        name: MATERIAL_FILE_COLLECTION,
        collection: MATERIAL_FILE_COLLECTION,
        disk: 'local',
        accessPath: MATERIAL_FILE_ACCESS_PATH,
        accessMode: 'stream',
        policy: materialFilePolicy,
        actions: {
          findMany: { maxLimit: 100 },
          findOne: {},
          uploadOne: { maxSize: 5 * 1024 * 1024 },
          uploadMany: { maxSize: 20 * 1024 * 1024 },
        },
      },
    ],
  });

function unauthorized(): ApiError {
  return new ApiError({
    status: 'UNAUTHENTICATED',
    reason: 'AUTHENTICATION_REQUIRED',
    domain: appErrorDomain,
    message: 'Authentication required.',
  });
}

/**
 * A stored file's id, with or without the extension the URL carries. Mirrors the plugin's own
 * content route so both agree on what a valid file name is.
 */
const FILE_NAME_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z0-9]{1,32})?$/;

/**
 * Wrap one file contribution in the application's own authentication.
 *
 * The API half only has to protect the collection's actions; the exposure's Policy already scopes
 * every read and delete to the signed-in owner. The byte half is the exposure's documented
 * exception — it serves anyone holding the UUID and ignores the Policy — so the guard there is the
 * only thing standing between one user's attachment and everybody else. It answers a file the
 * caller does not own exactly as it answers one that does not exist.
 */
function guardFileContribution(
  contribution: AppRouteContribution<Application>,
): AppRouteContribution<Application> {
  if (contribution.scope === 'api') {
    return defineApiRoutes<Application>(async (app) => {
      const router = new Hono();
      const auth = app.container.resolve(authenticationToken);
      router.use(`/${MATERIAL_FILE_COLLECTION}/*`, auth.required());
      router.route('/', await contribution.createRouter(app));
      return router;
    });
  }

  return defineRootRoutes<Application>(async (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const database = app.container.resolve(databaseManagerToken);

    router.use(
      `${MATERIAL_FILE_ACCESS_PATH}/:file`,
      auth.required(),
      async (context, next) => {
        const session = context.get('auth') as AuthSession | undefined;
        const ownerId = session?.user?.id;
        if (typeof ownerId !== 'string' || ownerId.length === 0) {
          throw unauthorized();
        }

        const match = FILE_NAME_PATTERN.exec(context.req.param('file') ?? '');
        if (!match) return context.notFound();

        const record = await database
          .repository<{ id: string; ownerId: string }>(MATERIAL_FILE_COLLECTION)
          .findOne({ filter: { id: match[1], ownerId } });
        if (!record) return context.notFound();

        await next();
      },
    );

    router.route('/', await contribution.createRouter(app));
    return router;
  });
}

/** The application-owned file routes: guarded uploads and owner-only attachment bytes. */
export const projectMaterialFileRoutes: readonly AppRouteContribution<Application>[] =
  fileContributions.map(guardFileContribution);
