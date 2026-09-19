import { Readable } from 'node:stream';

import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { ServiceContainer } from '@nocobase/service-provider';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import {
  deliveryServiceToken,
  MAX_FILE_SIZE,
  type DeliveryService,
} from '../providers/delivery-service.js';

const ACCESS_PATH = '/uploads/delivery-files';

/**
 * A multipart body is the file bytes plus its framing: the boundary markers,
 * the `Content-Disposition` header carrying the filename, and the part's
 * `Content-Type`. The transport limit therefore has to sit above the largest
 * file the business rule accepts, or a file of exactly {@link MAX_FILE_SIZE}
 * bytes is rejected with an opaque 413 before any handler can run. The
 * per-file limit itself is enforced against the stored row size in the
 * service, so this headroom only decides what reaches the route at all.
 */
export const MAX_UPLOAD_OVERHEAD = 64 * 1024;
export const MAX_UPLOAD_BODY_SIZE = MAX_FILE_SIZE + MAX_UPLOAD_OVERHEAD;

/**
 * The transport-level limit for an upload request. The file plugin installs
 * its own `bodyLimit` from {@link fileContributions}, whose default rejection
 * is an English `BODY_TOO_LARGE`; this one sits in front of it and answers the
 * caller in the application's own wording instead.
 */
export const uploadBodyLimit = bodyLimit({
  maxSize: MAX_UPLOAD_BODY_SIZE,
  onError: (context) =>
    context.json(
      { code: 'FILE_TOO_LARGE', message: '文件超过 5 MB 限制。' },
      413,
    ),
});
const FILE_PATTERN =
  /\/uploads\/delivery-files\/([0-9a-fA-F-]{36})(?:\.([a-z0-9]{1,32}))?$/;

/**
 * Types the browser can render in place. The byte route below serves these
 * with `inline`; everything else is a download. The file plugin's own byte
 * route is not mounted because it labels every object an attachment, which
 * would stop an in-page PDF preview.
 */
const INLINE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'pdf',
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'log',
]);
/**
 * Serving HTML or SVG inline would let a stored object run script on the
 * application origin, so only plain text MIME types are inline-eligible.
 */
const SAFE_TEXT_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/x-markdown',
]);

/**
 * The delivery file collection plus the policy the browser may use.
 *
 * Reading file rows through the plugin's CRUD is deliberately disabled: the
 * business API returns the metadata a page needs, and the byte route below is
 * the only other way in. `create` stays open so the upload action works, and
 * `uploadOne` carries the 5 MB limit the task requires.
 */
const fileContributions = defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: 'deliveryFiles',
      collection: 'deliveryFiles',
      connection: 'main',
      disk: 'local',
      // The generated CRUD/content routes are not mounted; this path only has
      // to satisfy the plugin's configuration validation.
      accessPath: ACCESS_PATH,
      accessMode: 'stream',
      policy: { read: false, create: true, update: false, delete: false },
      actions: {
        // The plugin applies this to the whole multipart request, so it must
        // include the file's framing; the file-size rule lives in the service.
        uploadOne: { maxSize: MAX_UPLOAD_BODY_SIZE },
      },
    },
  ],
});

interface FileRoutesApplication {
  readonly container: ServiceContainer;
  readonly publicBasePath?: string;
}

const apiContribution =
  fileContributions[0] as unknown as AppApiRouteContribution<FileRoutesApplication>;

/** Upload is the only exposed file API action; it requires a signed-in caller. */
export const deliveryFileApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes(async (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const inner = await apiContribution.createRouter(app);
    router.use('/deliveryFiles:uploadOne', auth.required());
    router.use('/deliveryFiles:uploadOne', uploadBodyLimit);
    router.route('/', inner);
    return router;
  });

/**
 * The byte route is read by image, PDF and download previews in the browser.
 * It authenticates the session cookie, asks the service whether this caller
 * may see this file, and only then reads the object. A member removed from a
 * project loses access immediately because membership is checked per request.
 */
export const deliveryFileRootRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes(async (app) => {
    const router = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const service =
      app.container.resolve<DeliveryService>(deliveryServiceToken);
    const database =
      app.container.resolve<DatabaseManager>(databaseManagerToken);
    const drive =
      app.container.resolve<NocoBaseDriveManager>(driveManagerToken);

    router.get(`${ACCESS_PATH}/:file`, auth.required(), async (context) => {
      const match = FILE_PATTERN.exec(context.req.path);
      if (!match) {
        return context.json(
          { code: 'NOT_FOUND', message: '文件不存在。' },
          404,
        );
      }
      const session = context.get('auth');
      if (!session) {
        return context.json(
          { code: 'UNAUTHORIZED', message: '请先登录。' },
          401,
        );
      }
      const actor = await service.resolveActor(session.user.id);
      const allowed = await service.canAccessFile(actor, match[1]);
      if (!allowed) {
        return context.json(
          { code: 'FORBIDDEN', message: '无权访问该文件。' },
          403,
        );
      }

      const record = await database
        .query()
        .selectFrom('deliveryFiles')
        .selectAll()
        .where('id', '=', match[1])
        .executeTakeFirst();
      const ext = asText(record?.ext);
      if (!record || ext !== (match[2] ?? '')) {
        return context.json(
          { code: 'NOT_FOUND', message: '文件不存在。' },
          404,
        );
      }
      const disk = drive.use(asText(record.disk));
      const key = asText(record.key);
      if (!(await disk.exists(key))) {
        return context.json(
          { code: 'NOT_FOUND', message: '文件不存在。' },
          404,
        );
      }

      const extension = ext.toLowerCase();
      const mimeType = asText(record.mimeType) || 'application/octet-stream';
      const inline =
        INLINE_EXTENSIONS.has(extension) &&
        (mimeType === 'application/pdf' ||
          mimeType.startsWith('image/') ||
          SAFE_TEXT_MIME.has(mimeType));
      const filename = encodeURIComponent(asText(record.filename)).replace(
        /['()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );

      context.header('Cache-Control', 'private, no-store');
      context.header('X-Content-Type-Options', 'nosniff');
      context.header(
        'Content-Type',
        inline ? mimeType : 'application/octet-stream',
      );
      context.header('Content-Length', String(Number(record.size)));
      context.header(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
      );
      return context.body(Readable.toWeb(await disk.getStream(key)));
    });

    return router as unknown as Hono;
  });

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
