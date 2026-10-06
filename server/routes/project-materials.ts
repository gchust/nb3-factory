import { Readable } from 'node:stream';

import type { Application } from '@nocobase/app-server/application';
import type { AppDriveConfig } from '@nocobase/app-server/drive';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { joinBasePath } from '@nocobase/app-server/support';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import {
  projectMaterialServiceToken,
  ProjectMaterialValidationError,
  type ProjectMaterial,
  type ProjectMaterialInput,
} from '../providers/project-material-service.js';

const ATTACHMENTS = 'projectMaterialAttachments';
const ATTACHMENTS_ACCESS_PATH = '/project-material-attachments';
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/** v1 accepts PNG photos and DOCX documents; anything else is refused here too. */
const ACCEPTED_EXTENSIONS = new Set(['png', 'docx']);

/** A response the route composes itself; `status` and `code` are the HTTP contract. */
class RouteError extends Error {
  public constructor(
    public readonly status: 400 | 404 | 415,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RouteError';
  }
}

/**
 * Keeps the byte route honest about what it will send: a stored mime type is
 * attacker-influenced (it began as the upload's `Content-Type`), so anything
 * that is not a well-formed `type/subtype` becomes a download.
 */
function safeMimeType(value: string): string {
  return /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(value)
    ? value.toLowerCase()
    : 'application/octet-stream';
}

/** The URL the browser can GET for an attachment's bytes, behind the app base path. */
function withContentUrl<T extends { id: string }>(
  app: { publicBasePath: string },
  attachment: T,
): T & { contentUrl: string } {
  return {
    ...attachment,
    contentUrl: joinBasePath(
      app.publicBasePath,
      `/api/projectMaterialFiles/${encodeURIComponent(attachment.id)}/content`,
    ),
  };
}

function decorateMaterial(
  app: { publicBasePath: string },
  material: ProjectMaterial,
): ProjectMaterial {
  return {
    ...material,
    attachments: material.attachments.map((attachment) =>
      withContentUrl(app, attachment),
    ),
  };
}

/** Read and narrow a create/update body. Every field is unknown until checked. */
function parseMaterialInput(body: unknown): ProjectMaterialInput {
  if (typeof body !== 'object' || body === null) {
    throw new RouteError(
      400,
      'INVALID_BODY',
      'A JSON object body is required.',
    );
  }

  const { title, attachmentIds } = body as {
    title?: unknown;
    attachmentIds?: unknown;
  };
  if (typeof title !== 'string') {
    throw new RouteError(400, 'INVALID_BODY', 'A title string is required.');
  }

  const ids = attachmentIds === undefined ? [] : attachmentIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new RouteError(
      400,
      'INVALID_BODY',
      'attachmentIds must be an array of strings.',
    );
  }

  return { title, attachmentIds: ids as string[] };
}

/**
 * Project materials and their private attachments.
 *
 * Authentication is installed on each owned prefix and every read and write is
 * additionally scoped by the caller's id inside the service, so a signed-in
 * colleague with a direct link to somebody else's material or file gets the
 * same 404 an unknown id gets. Nothing here is public.
 */
export const projectMaterialsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app): Hono => {
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(projectMaterialServiceToken);
    const fileManager = app.container.resolve(serverFileRepositoryManagerToken);
    const drive = app.container.resolve(driveManagerToken);
    const driveConfig = app.config.get<AppDriveConfig>('drive');
    if (!driveConfig?.default) {
      throw new Error('The drive configuration has no default disk.');
    }
    const defaultDisk = driveConfig.default;

    const router = new Hono<AuthEnv>();

    // A routing error is the response contract; anything else is a real fault
    // and is rethrown into the application's own handler.
    router.onError((error, context) => {
      if (error instanceof RouteError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status,
        );
      }
      if (error instanceof ProjectMaterialValidationError) {
        return context.json({ code: error.code, message: error.message }, 400);
      }
      throw error;
    });

    // Authentication only; scoped so it cannot leak into another contribution.
    for (const path of [
      '/projectMaterials',
      '/projectMaterials/*',
      '/projectMaterialAttachments/*',
      '/projectMaterialFiles/*',
    ]) {
      router.use(path, auth.required());
    }

    router.get('/projectMaterials', async (context) => {
      const { user } = context.get('auth')!;
      const materials = await service.listOwn(user.id);
      return context.json({
        data: materials.map((item) => decorateMaterial(app, item)),
      });
    });

    router.get('/projectMaterials/:materialId', async (context) => {
      const { user } = context.get('auth')!;
      const material = await service.getOwn(
        user.id,
        context.req.param('materialId'),
      );
      if (!material) {
        throw new RouteError(404, 'NOT_FOUND', 'Material not found.');
      }
      return context.json({ data: decorateMaterial(app, material) });
    });

    router.post('/projectMaterials', async (context) => {
      const { user } = context.get('auth')!;
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        throw new RouteError(
          400,
          'INVALID_BODY',
          'A JSON object body is required.',
        );
      }
      const material = await service.create(user.id, parseMaterialInput(body));
      return context.json({ data: decorateMaterial(app, material) }, 201);
    });

    router.patch('/projectMaterials/:materialId', async (context) => {
      const { user } = context.get('auth')!;
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        throw new RouteError(
          400,
          'INVALID_BODY',
          'A JSON object body is required.',
        );
      }
      const material = await service.update(
        user.id,
        context.req.param('materialId'),
        parseMaterialInput(body),
      );
      if (!material) {
        throw new RouteError(404, 'NOT_FOUND', 'Material not found.');
      }
      return context.json({ data: decorateMaterial(app, material) });
    });

    // Uploading creates an unattached file the uploader alone can see; it joins
    // a material only when a later save lists its id.
    router.post(
      '/projectMaterialAttachments/upload',
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
        if (
          !context.req
            .header('content-type')
            ?.toLowerCase()
            .startsWith('multipart/form-data;')
        ) {
          throw new RouteError(
            415,
            'UNSUPPORTED_MEDIA_TYPE',
            'Expected multipart/form-data.',
          );
        }

        let body: Record<string, string | File | (string | File)[]>;
        try {
          body = await context.req.parseBody({ all: true });
        } catch {
          throw new RouteError(
            400,
            'INVALID_MULTIPART',
            'Invalid multipart body.',
          );
        }

        const value = body.file;
        if (!(value instanceof File)) {
          throw new RouteError(
            400,
            'INVALID_FILE',
            'Exactly one File is required.',
          );
        }

        // The client's `accept` list is a convenience; the byte boundary is
        // where the v1 format scope is actually enforced.
        const extension = value.name.includes('.')
          ? value.name.split('.').pop()!.toLowerCase()
          : '';
        if (!ACCEPTED_EXTENSIONS.has(extension)) {
          throw new RouteError(
            415,
            'UNSUPPORTED_FILE_TYPE',
            'Only PNG photos and DOCX documents are accepted.',
          );
        }

        const files = fileManager.repository(ATTACHMENTS, {
          disk: defaultDisk,
          accessPath: ATTACHMENTS_ACCESS_PATH,
          policy: {
            read: true,
            create: { scope: true, defaults: { createdById: user.id } },
            update: false,
            delete: false,
          },
        });
        await files.validateCollection();
        const result = await files.uploadOne({ file: value });
        return context.json({
          data: {
            // An upload is a draft: it belongs to the uploader and to no material yet.
            record: withContentUrl(app, { ...result.record, materialId: null }),
            createdTargets: result.createdTargets,
          },
        });
      },
    );

    router.get(
      '/projectMaterialFiles/:attachmentId/content',
      async (context) => {
        const { user } = context.get('auth')!;
        const attachment = await service.findOwnedAttachment(
          user.id,
          context.req.param('attachmentId'),
        );
        if (!attachment) {
          throw new RouteError(404, 'NOT_FOUND', 'File not found.');
        }

        const disk = drive.use(attachment.disk);
        if (!(await disk.exists(attachment.key))) {
          throw new RouteError(404, 'NOT_FOUND', 'File not found.');
        }

        context.header('Cache-Control', 'private, no-store');
        context.header('Content-Type', safeMimeType(attachment.mimeType));
        context.header('Content-Length', String(attachment.size));
        context.header('X-Content-Type-Options', 'nosniff');
        context.header(
          'Content-Security-Policy',
          "sandbox; default-src 'none'",
        );
        context.header(
          'Content-Disposition',
          `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        );
        return context.body(
          Readable.toWeb(
            await disk.getStream(attachment.key),
          ) as ReadableStream,
        );
      },
    );

    // `AuthEnv` types the `auth` variable the middleware sets; the contribution
    // contract is expressed in terms of a plain `Hono`, so bridge the two here.
    return router as unknown as Hono;
  });

export default projectMaterialsApiRoutes;
