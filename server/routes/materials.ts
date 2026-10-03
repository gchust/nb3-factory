import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Readable } from 'node:stream';

import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { joinBasePath } from '@nocobase/app-server/support';
import type { Application } from '@nocobase/app-server/application';

import {
  MaterialValidationError,
  projectMaterialsServiceToken,
  type MaterialInput,
  type ProjectMaterialsService,
} from '../providers/materials/index.js';

/**
 * The file Collection this application uploads into. Declared in
 * `database/main/migrations/202609200001_create_project_materials.ts`.
 */
const FILE_COLLECTION = 'projectAttachments';

/** Rendered inline so an `<img>` can show it. Everything else downloads instead. */
const INLINE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * A header-safe content type. The stored value is attacker-influenced, so it is
 * lowercased, stripped of parameters, and falls back to a download type rather
 * than putting an arbitrary string in a response header.
 */
function safeContentType(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)
    ? normalized
    : 'application/octet-stream';
}

function contentUrl(app: Application, id: string): string {
  return joinBasePath(
    app.publicBasePath ?? '',
    `/api/project-attachments/${encodeURIComponent(id)}/content`,
  );
}

function validationResponse(error: MaterialValidationError): Response {
  return Response.json(
    { code: error.code, message: error.message },
    { status: 400 },
  );
}

async function readInput(context: {
  req: { json: () => Promise<unknown> };
}): Promise<MaterialInput> {
  try {
    const body = await context.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
    return body;
  } catch {
    return {};
  }
}

function isInlineAttachment(mimeType: string): boolean {
  return INLINE_MIME.has(safeContentType(mimeType));
}

/**
 * Material and attachment routes.
 *
 * Every path owns its own `auth.required()`. The upload path and the protected
 * content path deliberately do not reuse the file plugin's `accessPath`: that
 * route is public by design, while these attachments are private. The content
 * route answers only the uploader, so a colleague holding the link and an
 * anonymous visitor are refused.
 */
export const materialsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app: Application) => {
    const router = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const service: ProjectMaterialsService = app.container.resolve(
      projectMaterialsServiceToken,
    );
    const manager = app.container.resolve(serverFileRepositoryManagerToken);
    const disk = app.config.get<string>('drive.default') ?? 'local';

    router.post(
      '/projectAttachments:uploadOne',
      auth.required(),
      bodyLimit({
        maxSize: UPLOAD_MAX_BYTES,
        onError: (context) =>
          context.json(
            {
              code: 'BODY_TOO_LARGE',
              message: 'Upload request body is too large.',
            },
            413,
          ),
      }),
      async (context) => {
        const { user } = context.get('auth')!;
        const contentType = context.req.header('content-type')?.toLowerCase();
        if (!contentType?.startsWith('multipart/form-data;')) {
          return context.json(
            {
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message: 'Expected multipart/form-data.',
            },
            415,
          );
        }
        let body: Record<string, string | File | (string | File)[]>;
        try {
          body = await context.req.parseBody({ all: true });
        } catch {
          return context.json(
            { code: 'INVALID_MULTIPART', message: 'Invalid multipart body.' },
            400,
          );
        }
        const value = body.file;
        if (!(value instanceof File)) {
          return context.json(
            { code: 'INVALID_FILE', message: 'Exactly one File is required.' },
            400,
          );
        }

        // The upload path stamps the caller as owner, which is what keeps the
        // row inside the same scope every later read is filtered by.
        const files = manager.repository(FILE_COLLECTION, {
          disk,
          accessPath: '/api/project-attachments',
          policy: {
            read: false,
            create: { scope: true, defaults: { ownerId: user.id } },
            update: false,
            delete: false,
          },
        });
        try {
          await files.validateCollection();
          const result = await files.uploadOne({ file: value });
          return context.json({
            data: {
              ...result,
              record: {
                ...result.record,
                contentUrl: contentUrl(app, result.record.id),
              },
            },
          });
        } catch (error) {
          if (error instanceof Error && 'code' in error) {
            const code =
              typeof error.code === 'string' ? error.code : 'UPLOAD_FAILED';
            const status = code === 'INVALID_FILE' ? 400 : 500;
            return context.json({ code, message: error.message }, status);
          }
          throw error;
        }
      },
    );

    router.get(
      '/project-attachments/:id/content',
      auth.required(),
      async (context) => {
        const { user } = context.get('auth')!;
        const resolved = await service.resolveAttachment(
          user.id,
          context.req.param('id'),
        );
        if (resolved.status === 'missing') {
          return context.json(
            { code: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not found.' },
            404,
          );
        }
        if (resolved.status === 'forbidden' || !resolved.record) {
          return context.json(
            {
              code: 'ATTACHMENT_FORBIDDEN',
              message: 'You do not have access to this attachment.',
            },
            403,
          );
        }
        const record = resolved.record;
        const stream = await service.readAttachment(record);
        if (!stream) {
          return context.json(
            {
              code: 'ATTACHMENT_CONTENT_MISSING',
              message: 'The attachment content is not available.',
            },
            404,
          );
        }
        context.header('Content-Type', safeContentType(record.mimeType));
        context.header('Content-Length', String(record.size));
        context.header('X-Content-Type-Options', 'nosniff');
        context.header(
          'Content-Security-Policy',
          "sandbox; default-src 'none'",
        );
        context.header('Cache-Control', 'private, no-store');
        const disposition = isInlineAttachment(record.mimeType)
          ? 'inline'
          : 'attachment';
        context.header(
          'Content-Disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
        );
        return context.body(Readable.toWeb(stream));
      },
    );

    router.get('/project-materials', auth.required(), async (context) => {
      const { user } = context.get('auth')!;
      return context.json({ data: await service.list(user.id) });
    });

    router.post('/project-materials', auth.required(), async (context) => {
      const { user } = context.get('auth')!;
      try {
        return context.json({
          data: await service.create(user.id, await readInput(context)),
        });
      } catch (error) {
        if (error instanceof MaterialValidationError)
          return validationResponse(error);
        throw error;
      }
    });

    router.get('/project-materials/:id', auth.required(), async (context) => {
      const { user } = context.get('auth')!;
      const material = await service.get(user.id, context.req.param('id'));
      if (!material) {
        return context.json(
          { code: 'MATERIAL_NOT_FOUND', message: 'Material not found.' },
          404,
        );
      }
      return context.json({ data: material });
    });

    router.patch('/project-materials/:id', auth.required(), async (context) => {
      const { user } = context.get('auth')!;
      try {
        const material = await service.update(
          user.id,
          context.req.param('id'),
          await readInput(context),
        );
        if (!material) {
          return context.json(
            { code: 'MATERIAL_NOT_FOUND', message: 'Material not found.' },
            404,
          );
        }
        return context.json({ data: material });
      } catch (error) {
        if (error instanceof MaterialValidationError)
          return validationResponse(error);
        throw error;
      }
    });

    // `AppRouterFactory` types the returned router as the default `Hono`,
    // while `auth.required()` needs the `auth` context variable declared. It is
    // the same router; only the environment generic differs, so the cast is the
    // narrowest way to keep both truthful.
    return router as unknown as Hono;
  });
