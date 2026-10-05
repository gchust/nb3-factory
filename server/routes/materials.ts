import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

import {
  MATERIAL_FILES_ACCESS_PATH,
  MATERIAL_FILES_COLLECTION,
  MATERIAL_FILES_DISK,
  MATERIAL_FILES_RESOURCE,
  MATERIALS_RESOURCE,
  MaterialError,
  materialServiceToken,
  type MaterialFileRow,
  type MaterialService,
} from '../providers/materials.js';

/**
 * The HTTP surface of project materials.
 *
 * Every endpoint is owner-scoped: the owner is the signed-in account, never a
 * value taken from the request, so a caller can neither read nor write another
 * account's material by naming its id. {@link MaterialService} owns the
 * filtering; these routes only translate HTTP into calls on it.
 *
 * The attachments themselves are served by the File Repository exposure the
 * `file` plugin already provides, wrapped here with the application's own
 * authentication and an ownership check, because the plugin's byte route is
 * deliberately public. Uploading goes through the same exposure, so the
 * `create` scope and `createdById` default the plugin derives from the policy
 * below stamp the uploader onto every file.
 */

/** Whether the requester uploaded this attachment. */
function ownerFilePolicy(ownerId: string): RepositoryPolicy {
  return {
    read: { scope: { createdById: ownerId } },
    create: { scope: true, defaults: { createdById: ownerId } },
    update: false,
    delete: false,
  };
}

const supportedMimeTypes: ReadonlySet<string> = new Set([
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const supportedExtensions: readonly string[] = ['.png', '.docx'];

function isSupportedUpload(file: File): boolean {
  return (
    supportedMimeTypes.has(file.type.toLowerCase()) ||
    supportedExtensions.some((extension) =>
      file.name.toLowerCase().endsWith(extension),
    )
  );
}

/** The signed-in account. `auth.required()` has already refused an absent one. */
function ownerId(context: Context<AuthEnv>): string {
  const user = context.get('auth')?.user;
  if (!user?.id) {
    throw new HTTPException(401, { message: 'Authentication required.' });
  }
  return user.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

/** A title is accepted only as a string; anything else is treated as absent. */
function readTitle(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A positive integer, or `undefined` for anything else. */
function readPositiveInt(value: unknown): number | undefined {
  const candidate = typeof value === 'string' ? Number(value) : value;
  return typeof candidate === 'number' &&
    Number.isSafeInteger(candidate) &&
    candidate > 0
    ? candidate
    : undefined;
}

/** Accepts `{ id }`, `{ filterByTk }`, and `{ filter: { id } }`. */
function readId(body: Record<string, unknown>): number | undefined {
  const candidates = [
    body.id,
    body.filterByTk,
    isRecord(body.filter) ? body.filter.id : undefined,
  ];
  for (const candidate of candidates) {
    const value = readPositiveInt(candidate);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * An attachment's public URL. The byte route itself is guarded, so this is a
 * path a browser may request and not an authorization by itself.
 */
function contentUrl(app: Application, file: MaterialFileRow): string {
  const base = (app.publicBasePath ?? '').replace(/\/$/, '');
  return `${base}${MATERIAL_FILES_ACCESS_PATH}/${file.id}.${file.ext}`;
}

function decorateFile(
  app: Application,
  file: MaterialFileRow,
): MaterialFileRow & { contentUrl: string } {
  return { ...file, contentUrl: contentUrl(app, file) };
}

/** Refuses anything but the PNG and DOCX files the first version accepts. */
const acceptSupportedFiles: MiddlewareHandler<AuthEnv> = async (
  context,
  next,
) => {
  const contentType = context.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    await next();
    return;
  }
  const body = await context.req.parseBody({ all: true });
  const value = body.file;
  const selected = Array.isArray(value) ? value[0] : value;
  if (selected instanceof File && !isSupportedUpload(selected)) {
    return context.json(
      {
        code: 'UNSUPPORTED_FILE_TYPE',
        message:
          'Only PNG images and DOCX documents are accepted in this version.',
      },
      400,
    );
  }
  await next();
};

/**
 * Verifies that the signed-in account uploaded the attachment named in the
 * path. A record that is missing or belongs to somebody else is reported as
 * absent, so the route cannot be used to learn which files exist.
 */
function ownFileOnly(service: MaterialService): MiddlewareHandler<AuthEnv> {
  return async (context, next) => {
    const userId = context.get('auth')?.user?.id;
    const match =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/i.exec(
        context.req.param('file') ?? '',
      );
    if (!userId || !match) {
      return context.notFound();
    }
    const file = await service.findOwnFile(userId, match[1]);
    if (!file || file.ext !== (match[2] ?? '')) {
      return context.notFound();
    }
    await next();
  };
}

type FileRoutes = ReturnType<typeof defineFileRepositoryApiRoutes>;

/**
 * Wraps the File Repository contributions so the application's authentication
 * covers them. The plugin's own routes are public by contract; nothing outside
 * this wrapper reaches them.
 */
function securedFileRoutes(
  contributions: FileRoutes,
): AppRouteContribution<Application>[] {
  return contributions.map(
    (contribution): AppRouteContribution<Application> => {
      const createRouter = async (app: Application): Promise<Hono> => {
        const auth = app.container.resolve(authenticationToken);
        const service = app.container.resolve(materialServiceToken);
        const secured = new Hono<AuthEnv>();
        if (contribution.scope === 'api') {
          secured.use(`/${MATERIAL_FILES_RESOURCE}:uploadOne`, auth.required());
          secured.use(
            `/${MATERIAL_FILES_RESOURCE}:uploadOne`,
            acceptSupportedFiles,
          );
        } else {
          secured.use(`${MATERIAL_FILES_ACCESS_PATH}/:file`, auth.required());
          secured.use(
            `${MATERIAL_FILES_ACCESS_PATH}/:file`,
            ownFileOnly(service),
          );
        }
        secured.route('/', await contribution.createRouter(app));
        // Hono's router is invariant in its Env, while a contribution's factory
        // promises the blank environment. The middleware above is what carries
        // `AuthEnv`, so the assertion is only about that difference.
        return secured as unknown as Hono;
      };
      return contribution.scope === 'api'
        ? { scope: 'api', createRouter }
        : { scope: 'root', createRouter };
    },
  );
}

const fileRoutes: readonly AppRouteContribution<Application>[] =
  securedFileRoutes(
    defineFileRepositoryApiRoutes<string>({
      principal: (context) => {
        const user = (context as Context<AuthEnv>).get('auth')?.user;
        if (!user?.id) {
          throw new HTTPException(401, { message: 'Authentication required.' });
        }
        return user.id;
      },
      repositories: [
        {
          name: MATERIAL_FILES_RESOURCE,
          collection: MATERIAL_FILES_COLLECTION,
          disk: MATERIAL_FILES_DISK,
          accessPath: MATERIAL_FILES_ACCESS_PATH,
          policy: (owner) => ownerFilePolicy(owner),
          actions: { uploadOne: { maxSize: 10 * 1024 * 1024 } },
        },
      ],
    }),
  );

const materialRoutes: AppRouteContribution<Application> = defineApiRoutes(
  (app): Hono => {
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(materialServiceToken);
    const router = new Hono<AuthEnv>();

    router.onError((error, context) => {
      if (error instanceof MaterialError) {
        return context.json({ code: error.code, message: error.message }, 400);
      }
      throw error;
    });

    // Scope every middleware to the exact paths this router owns so it cannot
    // reach a contribution mounted beside it.
    for (const path of [
      `/${MATERIALS_RESOURCE}:list`,
      `/${MATERIALS_RESOURCE}:get`,
      `/${MATERIALS_RESOURCE}:create`,
      `/${MATERIALS_RESOURCE}:update`,
      `/${MATERIALS_RESOURCE}:destroy`,
      `/${MATERIAL_FILES_RESOURCE}:list`,
    ]) {
      router.use(path, auth.required());
    }

    const listMaterials = async (context: Context<AuthEnv>) =>
      context.json({ data: await service.list(ownerId(context)) });

    router.post(`/${MATERIALS_RESOURCE}:list`, listMaterials);
    router.get(`/${MATERIALS_RESOURCE}:list`, listMaterials);

    const getMaterial = async (context: Context<AuthEnv>) => {
      const id = readId(await readJson(context));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'A material id is required.' },
          400,
        );
      }
      const material = await service.get(ownerId(context), id);
      if (!material) return context.notFound();
      return context.json({ data: material });
    };

    router.post(`/${MATERIALS_RESOURCE}:get`, getMaterial);
    router.get(`/${MATERIALS_RESOURCE}:get`, getMaterial);

    const createMaterial = async (context: Context<AuthEnv>) => {
      const body = await readJson(context);
      const values = isRecord(body.values) ? body.values : body;
      const material = await service.create(ownerId(context), {
        title: readTitle(values.title),
        fileIds:
          values.fileIds === undefined
            ? []
            : (values.fileIds as readonly string[]),
      });
      return context.json({ data: material });
    };

    router.post(`/${MATERIALS_RESOURCE}:create`, createMaterial);

    const updateMaterial = async (context: Context<AuthEnv>) => {
      const body = await readJson(context);
      const id = readId(body);
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'A material id is required.' },
          400,
        );
      }
      const values = isRecord(body.values) ? body.values : body;
      const material = await service.update(ownerId(context), id, {
        title: values.title === undefined ? undefined : readTitle(values.title),
        fileIds:
          values.fileIds === undefined
            ? undefined
            : (values.fileIds as readonly string[]),
      });
      if (!material) return context.notFound();
      return context.json({ data: material });
    };

    router.post(`/${MATERIALS_RESOURCE}:update`, updateMaterial);

    const destroyMaterial = async (context: Context<AuthEnv>) => {
      const id = readId(await readJson(context));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'A material id is required.' },
          400,
        );
      }
      const removed = await service.remove(ownerId(context), id);
      if (!removed) return context.notFound();
      return context.json({ data: { id, deleted: true } });
    };

    router.post(`/${MATERIALS_RESOURCE}:destroy`, destroyMaterial);

    const listFiles = async (context: Context<AuthEnv>) => {
      const body = await readJson(context);
      const materialId = readId(body) ?? readPositiveInt(body.materialId);
      const records = await service.listFiles(ownerId(context), materialId);
      return context.json({
        data: records.map((record) => decorateFile(app, record)),
      });
    };

    router.post(`/${MATERIAL_FILES_RESOURCE}:list`, listFiles);
    router.get(`/${MATERIAL_FILES_RESOURCE}:list`, listFiles);

    // See `securedFileRoutes` for why the Env invariant is bridged here.
    return router as unknown as Hono;
  },
);

export const materialsRoutes: readonly AppRouteContribution<Application>[] = [
  ...fileRoutes,
  materialRoutes,
];

export default materialsRoutes;
