import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import type { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import {
  MaterialValidationError,
  materialsServiceToken,
  type MaterialFileRecord,
  type MaterialWithFiles,
} from '../providers/materials.js';

/** The application surface a file-plugin contribution is created against. */
interface FileRoutesApplication {
  readonly container: ServiceContainer;
  readonly publicBasePath?: string;
}

/**
 * The file columns the plugin's Repository contract knows. It is not re-exported by
 * `@nocobase/app-plugin-file/server`, and `material_files` was migrated with exactly these columns, so the list is
 * spelled out here and kept in step with the migration that created the table.
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

/** The access path the byte route is served under; the business policy can only hand out URLs it can name. */
const ACCESS_PATH = '/uploads/materials';

interface SerializedFile {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  createdAt: string | Date;
  updatedAt: string | Date;
  contentUrl: string;
}

interface SerializedMaterial {
  id: string;
  title: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  files: SerializedFile[];
}

function serializeSize(value: MaterialFileRecord['size']): number | string {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  return value;
}

/**
 * The URL a browser fetches the bytes from. It is absolute from the deployment's public base path, which every
 * environment resolves differently and the runtime restores, so the page never has to construct one.
 */
function serializeFile(
  file: MaterialFileRecord,
  publicBasePath: string,
): SerializedFile {
  const base = publicBasePath.replace(/\/$/, '');
  const extension = file.ext ? `.${file.ext}` : '';
  return {
    id: file.id,
    disk: file.disk,
    key: file.key,
    filename: file.filename,
    ext: file.ext,
    mimeType: file.mimeType,
    size: serializeSize(file.size),
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    contentUrl: `${base}${ACCESS_PATH}/${encodeURIComponent(file.id)}${extension}`,
  };
}

function serializeMaterial(
  value: MaterialWithFiles,
  publicBasePath: string,
): SerializedMaterial {
  return {
    id: value.material.id,
    title: value.material.title,
    createdAt: value.material.createdAt,
    updatedAt: value.material.updatedAt,
    files: value.files.map((file) => serializeFile(file, publicBasePath)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The file plugin's public byte route serves anyone holding the UUID. Business ownership lives here: the uploader
 * is the only principal allowed to read the bytes, and a request for a file that does not exist or belongs to
 * somebody else gets the same 404 so the route does not disclose which ids exist.
 */
function contentOwnership(app: Application): MiddlewareHandler<AuthEnv> {
  const files = app.container
    .resolve(databaseManagerToken)
    .repository<MaterialFileRecord>('material_files');
  return async (context, next) => {
    const userId = context.get('auth')?.user?.id;
    const match =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/.exec(
        context.req.param('file') ?? '',
      );
    if (!userId || !match) {
      return context.notFound();
    }
    const record = await files.findOne({
      filter: { id: match[1], ownerId: userId },
    });
    if (!record) {
      return context.notFound();
    }
    await next();
  };
}

/**
 * Re-mounts a plugin contribution behind the application's own authentication.
 *
 * The plugin documents its routes as application-owned, so the middleware is added on the exact paths this
 * contribution serves rather than with a wildcard: mounted routers are flattened into one, and a `use('*')` would
 * reach the sibling `/api` routes registered before and after it.
 */
function authenticated(
  contribution: AppRouteContribution<FileRoutesApplication>,
  patterns: readonly string[],
  extra?: (app: Application) => MiddlewareHandler<AuthEnv>,
): AppRouteContribution<Application> {
  const createRouter = async (app: Application): Promise<Hono> => {
    const inner = await contribution.createRouter(app);
    const auth = app.container.resolve(authenticationToken);
    const guard = extra?.(app);
    const router = new Hono<AuthEnv>();
    for (const pattern of patterns) {
      router.use(pattern, auth.required());
      if (guard) {
        router.use(pattern, guard);
      }
    }
    router.route('/', inner);
    return router as unknown as Hono;
  };
  return contribution.scope === 'api'
    ? defineApiRoutes(createRouter)
    : defineRootRoutes(createRouter);
}

export function createMaterialsRoutes(): readonly AppRouteContribution<Application>[] {
  const [fileApi, fileContent] = defineFileRepositoryApiRoutes<string>({
    // The policy function is built per request; this is the principal it is handed.
    principal: (context) =>
      (context as Context<AuthEnv>).get('auth')?.user?.id ?? '',
    repositories: [
      {
        name: 'materialFiles',
        collection: 'material_files',
        connection: 'main',
        disk: 'local',
        accessPath: ACCESS_PATH,
        accessMode: 'stream',
        // Reads and deletes only ever see the caller's own rows. Writes are uploads, whose values the plugin
        // composes; the create scope and `ownerId` default are what stamp ownership on a new file.
        policy: (ownerId: string) => ({
          read: { scope: { ownerId }, fields: FILE_COLUMNS },
          create: {
            scope: { ownerId },
            defaults: { ownerId },
            fields: FILE_COLUMNS,
            relations: {},
          },
          update: false,
          delete: { scope: { ownerId } },
        }),
        actions: {
          findMany: {},
          findOne: {},
          uploadOne: { maxSize: 5 * 1024 * 1024 },
        },
      },
    ],
  });

  const businessRoutes = defineApiRoutes((app: Application) => {
    const auth = app.container.resolve(authenticationToken);
    const materials = app.container.resolve(materialsServiceToken);
    const publicBasePath = app.publicBasePath;
    const router = new Hono();

    // Two patterns, because Hono matches a middleware path exactly unless it ends in a wildcard: `/materials` covers the
    // list and create routes, `/materials/*` the ones that carry an id. Missing the second left every request to
    // `/materials/:id` unauthenticated while the handler still expected a session.
    router.use('/materials', auth.required());
    router.use('/materials/*', auth.required());

    router.get('/materials', async (context) => {
      const ownerId = authUserId(context);
      const list = await materials.list(ownerId);
      return context.json({
        data: list.map((item) => serializeMaterial(item, publicBasePath)),
      });
    });

    router.get('/materials/:id', async (context) => {
      const ownerId = authUserId(context);
      const material = await materials.get(ownerId, context.req.param('id'));
      if (!material) {
        return context.json({ code: 'NOT_FOUND' }, 404);
      }
      return context.json({
        data: serializeMaterial(material, publicBasePath),
      });
    });

    router.post('/materials', async (context) => {
      const ownerId = authUserId(context);
      const body = await readJson(context);
      if (!isRecord(body)) {
        return context.json({ code: 'INVALID_BODY' }, 400);
      }
      try {
        const material = await materials.create(ownerId, {
          title: body.title,
          fileIds: body.fileIds,
        });
        return context.json(
          { data: serializeMaterial(material, publicBasePath) },
          201,
        );
      } catch (error: unknown) {
        return validationResponse(context, error);
      }
    });

    router.patch('/materials/:id', async (context) => {
      const ownerId = authUserId(context);
      const body = await readJson(context);
      if (!isRecord(body)) {
        return context.json({ code: 'INVALID_BODY' }, 400);
      }
      try {
        const material = await materials.update(
          ownerId,
          context.req.param('id'),
          { title: body.title, fileIds: body.fileIds },
        );
        if (!material) {
          return context.json({ code: 'NOT_FOUND' }, 404);
        }
        return context.json({
          data: serializeMaterial(material, publicBasePath),
        });
      } catch (error: unknown) {
        return validationResponse(context, error);
      }
    });

    router.delete('/materials/:id', async (context) => {
      const ownerId = authUserId(context);
      const removed = await materials.remove(ownerId, context.req.param('id'));
      if (!removed) {
        return context.json({ code: 'NOT_FOUND' }, 404);
      }
      return context.json({ data: { id: context.req.param('id') } });
    });

    return router;
  });

  return [
    authenticated(fileApi, ['/materialFiles*']),
    authenticated(fileContent, [`${ACCESS_PATH}/:file`], contentOwnership),
    businessRoutes,
  ];
}

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

/** The id `auth.required()` has already established for this request. */
function authUserId(context: Context): string {
  const auth = (context as Context<AuthEnv>).get('auth');
  if (!auth) {
    throw new Error('An authenticated route ran without a session.');
  }
  return auth.user.id;
}

function validationResponse(context: Context, error: unknown): Response {
  if (error instanceof MaterialValidationError) {
    return context.json({ code: error.code, message: error.message }, 400);
  }
  throw error;
}

export default createMaterialsRoutes();
