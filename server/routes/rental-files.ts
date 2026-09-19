import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { Readable } from 'node:stream';

import { resolveRentalRole } from '../providers/rental-access.js';
import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_UPLOAD,
  RENTAL_FILE_ACCESS_PATH,
  RENTAL_FILE_COLLECTION,
  RENTAL_FILE_DISK,
  RENTAL_FILE_RESOURCE,
} from '../providers/rental-files.js';
import {
  rentalServiceToken,
  type RentalService,
} from '../providers/rental-service.js';

/**
 * The File Repository exposure for rental files.
 *
 * Only uploads are exposed: file listing and removal go through the rental
 * attachment routes, where the business access rules live, so a signed-in user
 * can never enumerate another booking's filenames through this surface. The
 * route helper installs no authentication of its own, which is why the upload
 * paths below are wrapped with `auth.required()`.
 */
const fileRepository = defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: RENTAL_FILE_RESOURCE,
      collection: RENTAL_FILE_COLLECTION,
      connection: 'main',
      disk: RENTAL_FILE_DISK,
      accessPath: RENTAL_FILE_ACCESS_PATH,
      accessMode: 'stream',
      policy: { read: false, create: true, update: false, delete: false },
      actions: {
        // The individual-file limit is enforced again when the file is linked;
        // the body limits leave headroom for multipart overhead so an exactly
        // 5 MB file is not rejected before it can be validated.
        uploadOne: { maxSize: MAX_FILE_BYTES + 1024 * 1024 },
        uploadMany: {
          maxSize: MAX_FILES_PER_UPLOAD * MAX_FILE_BYTES + 1024 * 1024,
        },
      },
    },
  ],
});

/** Authenticated upload endpoints for rental files. */
export const rentalFileUploadRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const uploadOne = `/${RENTAL_FILE_RESOURCE}:uploadOne`;
    const uploadMany = `/${RENTAL_FILE_RESOURCE}:uploadMany`;
    // The File Repository helper installs no authentication; the two upload
    // paths it exposes are guarded here before its router is mounted.
    router.use(uploadOne, auth.required() as unknown as MiddlewareHandler);
    router.use(uploadMany, auth.required() as unknown as MiddlewareHandler);
    router.route('/', await fileRepository[0].createRouter(app));
    return router;
  });

const UUID_EXT = /^([0-9a-f-]{36})(?:\.([a-z0-9]{1,32}))?$/;

/**
 * Content route for rental files. The File Repository's own byte route is
 * public, so this application serves the bytes itself and checks first that
 * the caller may read the business record the file is attached to. A file URL
 * therefore reveals nothing to someone without access to its rental.
 */
export const rentalFileContentRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes((app) => {
    const router = new Hono();
    const content = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const database =
      app.container.resolve<DatabaseManager>(databaseManagerToken);
    const service = app.container.resolve<RentalService>(rentalServiceToken);
    const authorization = app.container.has(authorizationToken)
      ? app.container.resolve<AppAuthorization>(authorizationToken)
      : undefined;

    content.use(`${RENTAL_FILE_ACCESS_PATH}/:file`, auth.required());
    content.get(`${RENTAL_FILE_ACCESS_PATH}/:file`, async (context) => {
      const session = context.get('auth');
      if (!session) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }

      const match = UUID_EXT.exec(context.req.param('file') ?? '');
      if (!match) return context.notFound();
      const fileId = match[1];
      const ext = match[2] ?? '';

      const record = await database
        .query()
        .selectFrom(RENTAL_FILE_COLLECTION)
        .selectAll()
        .where('id', '=', fileId)
        .executeTakeFirst();
      if (!record || text(record.ext) !== ext) {
        return context.notFound();
      }

      const role = await resolveRentalRole(authorization, session.user.id);
      const allowed = await service.canReadFile(
        { userId: session.user.id, role },
        fileId,
      );
      if (!allowed) {
        return context.json(
          { code: 'FORBIDDEN', message: 'You may not read this file.' },
          403,
        );
      }

      const disk = app.container
        .resolve(driveManagerToken)
        .use(text(record.disk, RENTAL_FILE_DISK));
      const key = text(record.key);
      if (!(await disk.exists(key))) return context.notFound();

      const filename = text(record.filename, 'file');
      context.header('Cache-Control', 'private, no-store');
      context.header('Content-Type', safeMime(text(record.mimeType)));
      context.header('Content-Length', String(numeric(record.size)));
      context.header('X-Content-Type-Options', 'nosniff');
      context.header('Content-Security-Policy', "sandbox; default-src 'none'");
      context.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(
          Buffer.from(filename).toString('utf8'),
        ).replace(
          /['()*]/g,
          (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
        )}`,
      );
      return context.body(
        Readable.toWeb(await disk.getStream(key)) as unknown as ReadableStream,
      );
    });

    router.route('/', content);
    return router;
  });

/** Keeps a malformed stored MIME type from becoming a response header. */
function safeMime(value: string): string {
  return /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(value)
    ? value.toLowerCase()
    : 'application/octet-stream';
}

/** Reads a stored column as text without stringifying an object. */
function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Reads a stored numeric column as a finite number. */
function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
