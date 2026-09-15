import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  FileRepositoryError,
  serverFileRepositoryManagerToken,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { getRequestTranslator } from '@nocobase/i18n/server';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Readable } from 'node:stream';

import {
  MAX_UPLOAD_BYTES,
  canonicalMimeType,
  classifyMediaFile,
} from '../media/allowed-types.js';
import {
  MediaError,
  mediaContentUrl,
  mediaServiceToken,
  type MediaAccess,
  type MediaErrorCode,
  type MediaService,
} from '../media/service.js';

// The File plugin's Repository contract: a fixed collection shape, one disk and one content path.
// The collection is named by its logical name so the plugin validates the declared field types.
const FILE_COLLECTION = 'mediaFiles';
const FILE_DISK = 'local';
const FILE_ACCESS_PATH = '/uploads/media';

const ERROR_MESSAGES: Readonly<Record<MediaErrorCode, [string, string]>> = {
  TYPE_NOT_ALLOWED: [
    'media.error.typeNotAllowed',
    'This file type is not allowed.',
  ],
  MIME_NOT_ALLOWED: [
    'media.error.mimeNotAllowed',
    'This file type is not allowed for security reasons.',
  ],
  FILE_NOT_FOUND: [
    'media.error.fileNotFound',
    'The uploaded file could not be found.',
  ],
  FILE_ALREADY_LINKED: [
    'media.error.fileAlreadyLinked',
    'This file is already in the media library.',
  ],
  INVALID_NAME: ['media.error.invalidName', 'A name is required.'],
  INVALID_STATUS: [
    'media.error.invalidStatus',
    'That status is not supported.',
  ],
  NOT_FOUND: ['media.error.notFound', 'The media asset was not found.'],
};

/**
 * The media library API. Every route installs its own authentication, and the write routes then
 * check the caller's role through the service so that authentication is never mistaken for
 * authorization.
 */
export function createMediaApiRouter(app: Application): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();
  const auth = app.container.resolve(authenticationToken);
  const media = app.container.resolve(mediaServiceToken);
  const basePath = app.publicBasePath;

  // Upload. A Standard Library `File` value only: the client selects a local file, never a URL.
  router.post(
    '/mediaFiles:uploadOne',
    auth.required(),
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: (context) =>
        context.json(
          { code: 'MEDIA_FILE_TOO_LARGE', message: tooLargeMessage(context) },
          413,
        ),
    }),
    async (context) => {
      const { access } = await accessFor(context, media);
      if (!access.canManage) return forbidden(context);
      return uploadOne(context, app);
    },
  );

  // Everything under /media requires a session; guests are a signed-in role, so they pass here
  // and are limited by the access flags instead.
  router.use('/media/*', auth.required());

  router.get('/media/access', async (context) => {
    const { access } = await accessFor(context, media);
    return context.json({ data: access });
  });

  router.get('/media/assets', async (context) => {
    const { access } = await accessFor(context, media);
    const url = new URL(context.req.url);
    const data = await media.listAssets(
      {
        type: url.searchParams.get('type') ?? undefined,
        tag: url.searchParams.get('tag') ?? undefined,
        name: url.searchParams.get('name') ?? undefined,
        page: url.searchParams.get('page') ?? undefined,
        pageSize: url.searchParams.get('pageSize') ?? undefined,
      },
      access,
      basePath,
    );
    return context.json({ data });
  });

  router.get('/media/assets/:id', async (context) => {
    const { access } = await accessFor(context, media);
    const asset = await media.getAsset(
      context.req.param('id'),
      access,
      basePath,
    );
    if (!asset) return notFound(context);
    return context.json({ data: asset });
  });

  router.post('/media/assets', async (context) => {
    const { access, user } = await accessFor(context, media);
    if (!access.canManage) return forbidden(context);
    const body = await readJson(context);
    if (body === undefined) return invalidJson(context);
    try {
      const asset = await media.createAsset(
        body,
        { id: user.id, name: user.name },
        access,
        basePath,
      );
      return context.json({ data: asset }, 201);
    } catch (error) {
      return mediaError(context, error);
    }
  });

  router.patch('/media/assets/:id', async (context) => {
    const { access } = await accessFor(context, media);
    if (!access.canManage) return forbidden(context);
    const body = await readJson(context);
    if (body === undefined) return invalidJson(context);
    try {
      const asset = await media.updateAsset(
        context.req.param('id'),
        body,
        access,
        basePath,
      );
      if (!asset) return notFound(context);
      return context.json({ data: asset });
    } catch (error) {
      return mediaError(context, error);
    }
  });

  router.get('/media/stats', async (context) => {
    const { access } = await accessFor(context, media);
    return context.json({ data: await media.stats(access) });
  });

  return router;
}

/**
 * Serves file bytes. It is the address recorded as `contentUrl`, so opening a disabled asset's
 * download address directly is refused for everyone except the roles that may manage assets, and a
 * guest is refused outright.
 */
export function createMediaContentRouter(app: Application): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();
  const auth = app.container.resolve(authenticationToken);
  const media = app.container.resolve(mediaServiceToken);

  router.use(`${FILE_ACCESS_PATH}/*`, auth.required());
  router.get(`${FILE_ACCESS_PATH}/:file`, async (context) => {
    const match =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/i.exec(
        context.req.param('file'),
      );
    if (!match) return context.notFound();
    const fileId = match[1];
    const ext = match[2] ?? '';

    const file = await media.findFile(fileId);
    if (!file || file.ext !== ext) return context.notFound();

    const { access } = await accessFor(context, media);
    if (access.isGuest) return forbidden(context);
    const status = await media.assetStatusForFile(fileId);
    if (status !== 'available' && !access.canManage) {
      return forbidden(context);
    }

    const drive = app.container.resolve(driveManagerToken);
    const disk = drive.use(file.disk);
    if (!(await disk.exists(file.key))) return context.notFound();

    context.header('Cache-Control', 'private, no-store');
    context.header('Content-Type', validMime(file.mimeType));
    context.header('Content-Length', String(file.size));
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('Content-Security-Policy', "sandbox; default-src 'none'");
    context.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeFilename(file.filename)}`,
    );
    return context.body(
      Readable.toWeb(await disk.getStream(file.key)) as ReadableStream,
    );
  });

  return router;
}

export const mediaApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => createMediaApiRouter(app) as unknown as Hono);

export const mediaContentRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes((app) => createMediaContentRouter(app) as unknown as Hono);

async function uploadOne(
  context: Context<AuthEnv>,
  app: Application,
): Promise<Response> {
  const contentType = (context.req.header('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith('multipart/form-data;')) {
    return context.json(
      {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: mediaMessage(
          context,
          'media.error.invalidFile',
          {},
          'Select a file to upload.',
        ),
      },
      415,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await context.req.parseBody({ all: true });
  } catch {
    return context.json(
      {
        code: 'INVALID_MULTIPART',
        message: mediaMessage(
          context,
          'media.error.invalidFile',
          {},
          'Select a file to upload.',
        ),
      },
      400,
    );
  }

  const value = body.file;
  if (!(value instanceof File)) {
    return context.json(
      {
        code: 'INVALID_FILE',
        message: mediaMessage(
          context,
          'media.error.invalidFile',
          {},
          'Select a file to upload.',
        ),
      },
      400,
    );
  }
  if (value.size > MAX_UPLOAD_BYTES) {
    return context.json(
      { code: 'MEDIA_FILE_TOO_LARGE', message: tooLargeMessage(context) },
      413,
    );
  }

  const classification = classifyMediaFile(value.name, value.type);
  if (!classification.ok) {
    const [key, fallback] = ERROR_MESSAGES[classification.code];
    return context.json(
      {
        code: classification.code,
        message: mediaMessage(context, key, {}, fallback),
      },
      400,
    );
  }

  // Store the canonical type for the extension so preview and content responses agree.
  const mimeType = canonicalMimeType(classification.ext);
  const upload =
    value.type === mimeType
      ? value
      : new File([new Uint8Array(await value.arrayBuffer())], value.name, {
          type: mimeType,
        });

  const files = app.container
    .resolve(serverFileRepositoryManagerToken)
    .repository(FILE_COLLECTION, {
      disk: FILE_DISK,
      accessPath: FILE_ACCESS_PATH,
    });

  try {
    const { record } = await files.uploadOne({ file: upload });
    return context.json({
      data: {
        record: {
          ...record,
          contentUrl: mediaContentUrl(
            app.publicBasePath,
            String(record.id),
            record.ext,
          ),
        },
      },
    });
  } catch (error) {
    if (error instanceof FileRepositoryError) {
      return context.json(
        {
          code: error.code,
          message: mediaMessage(
            context,
            'media.error.uploadFailed',
            {},
            'The upload failed. Please try again.',
          ),
        },
        error.code === 'BODY_TOO_LARGE' ? 413 : 500,
      );
    }
    throw error;
  }
}

async function accessFor(
  context: Context<AuthEnv>,
  media: MediaService,
): Promise<{
  access: MediaAccess;
  user: { id: string; name?: string };
}> {
  const user = context.get('auth')?.user;
  const access = await media.resolveAccess(user?.id);
  return {
    access,
    user: { id: user?.id ?? '', name: user?.name ?? undefined },
  };
}

async function readJson(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await context.req.json();
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function mediaError(context: Context<AuthEnv>, error: unknown): Response {
  if (error instanceof MediaError) {
    const [key, fallback] = ERROR_MESSAGES[error.code];
    return context.json(
      { code: error.code, message: mediaMessage(context, key, {}, fallback) },
      error.status,
    );
  }
  throw error;
}

function forbidden(context: Context<AuthEnv>): Response {
  return context.json(
    {
      code: 'MEDIA_FORBIDDEN',
      message: mediaMessage(
        context,
        'media.error.forbidden',
        {},
        'You do not have permission to perform this action.',
      ),
    },
    403,
  );
}

function notFound(context: Context<AuthEnv>): Response {
  return context.json(
    {
      code: 'MEDIA_NOT_FOUND',
      message: mediaMessage(
        context,
        'media.error.notFound',
        {},
        'The media asset was not found.',
      ),
    },
    404,
  );
}

function invalidJson(context: Context<AuthEnv>): Response {
  return context.json(
    {
      code: 'INVALID_BODY',
      message: mediaMessage(
        context,
        'media.error.invalidName',
        {},
        'A name is required.',
      ),
    },
    400,
  );
}

function tooLargeMessage(context: TranslatorHost): string {
  return mediaMessage(
    context,
    'media.error.tooLarge',
    { maxMb: Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024)) },
    'The file is larger than the limit.',
  );
}

/** Anything that can resolve the request's translator; both the API and body-limit contexts fit. */
interface TranslatorHost {
  get(key: string): unknown;
}

function mediaMessage(
  context: TranslatorHost,
  key: string,
  options: Record<string, unknown>,
  fallback: string,
): string {
  try {
    return getRequestTranslator(context as unknown as Context)(key, {
      ...options,
      defaultValue: fallback,
    });
  } catch {
    return fallback;
  }
}

function validMime(value: string): string {
  return /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(value)
    ? value.toLowerCase()
    : 'application/octet-stream';
}

function encodeFilename(filename: string): string {
  return encodeURIComponent(Buffer.from(filename).toString('utf8')).replace(
    /['()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
