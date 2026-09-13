import { Readable } from 'node:stream';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import {
  RESOURCE_FILES_ACCESS_PATH,
  RESOURCE_FILES_COLLECTION,
  RESOURCE_FILES_DISK,
} from '../providers/resource-center.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const LIST_LIMIT = 200;

interface StoredFile {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number | string | bigint;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

function openRepository(app: Application) {
  return app.container
    .resolve(serverFileRepositoryManagerToken)
    .repository(RESOURCE_FILES_COLLECTION, {
      disk: RESOURCE_FILES_DISK,
      accessPath: RESOURCE_FILES_ACCESS_PATH,
    });
}

// Uploads and metadata reads. The sub-router carries its own authentication and is mounted
// under `/resource-files`, so the middleware cannot reach any other `/api` contribution.
const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const files = openRepository(app);
    const basePath = app.publicBasePath.replace(/\/$/, '');

    const scoped = new Hono();
    scoped.use('*', auth.required());

    scoped.get('/', async (context) => {
      const records = (await files.findMany({
        limit: LIST_LIMIT,
        sort: (sort) => sort.field('createdAt').desc(),
      })) as readonly StoredFile[];
      return context.json({
        data: records.map((record) => serialize(record, basePath, files)),
      });
    });

    scoped.post(
      '/upload',
      bodyLimit({
        maxSize: MAX_UPLOAD_BYTES,
        onError: (context) => context.json({ code: 'BODY_TOO_LARGE' }, 413),
      }),
      async (context) => {
        if (
          !context.req
            .header('content-type')
            ?.toLowerCase()
            .startsWith('multipart/form-data;')
        ) {
          return context.json({ code: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
        }

        let body: Record<string, unknown>;
        try {
          body = await context.req.parseBody({ all: true });
        } catch {
          return context.json({ code: 'INVALID_MULTIPART' }, 400);
        }

        const value = body.file;
        if (!(value instanceof File)) {
          return context.json({ code: 'INVALID_FILE' }, 400);
        }

        const { record } = await files.uploadOne({ file: value });
        return context.json({
          data: serialize(record as StoredFile, basePath, files),
        });
      },
    );

    router.route('/resource-files', scoped);
    return router;
  },
);

// Stored bytes. Mounted at the same application path the content URLs point at, behind the
// application's own session.
const rootRoutes: AppRootRouteContribution<Application> = defineRootRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const files = openRepository(app);
    const drive = app.container.resolve(driveManagerToken);

    const scoped = new Hono();
    scoped.use('*', auth.required());

    scoped.get('/:file', async (context) => {
      const match =
        /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/i.exec(
          context.req.param('file'),
        );
      if (!match) return context.notFound();

      const record = (await files.findOne({
        filter: { id: match[1] },
      })) as StoredFile | undefined;
      if (!record || record.ext !== (match[2] ?? '')) return context.notFound();

      const disk = drive.use(record.disk);
      if (!(await disk.exists(record.key))) return context.notFound();

      context.header('Cache-Control', 'private, no-store');
      context.header('Content-Type', safeMimeType(record.mimeType));
      context.header('Content-Length', String(record.size));
      context.header('X-Content-Type-Options', 'nosniff');
      context.header('Content-Security-Policy', "sandbox; default-src 'none'");
      context.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
      );

      return context.body(Readable.toWeb(await disk.getStream(record.key)));
    });

    router.route(RESOURCE_FILES_ACCESS_PATH, scoped);
    return router;
  },
);

function serialize(
  record: StoredFile,
  basePath: string,
  files: ReturnType<typeof openRepository>,
): {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contentUrl: string;
} {
  return {
    id: record.id,
    filename: record.filename,
    ext: record.ext,
    mimeType: record.mimeType,
    size: Number(record.size),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    contentUrl: `${basePath}${files.getUrl({ id: record.id, ext: record.ext })}`,
  };
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function safeMimeType(value: string): string {
  const cleaned = value.replace(/[\r\n]/g, '').trim();
  return cleaned || 'application/octet-stream';
}

const resourceFileRoutes: readonly AppRouteContribution<Application>[] = [
  apiRoutes,
  rootRoutes,
];

export default resourceFileRoutes;
