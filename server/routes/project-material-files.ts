import { Readable } from 'node:stream';
import { Hono } from 'hono';
import type { Context } from 'hono';

import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  serverFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/server';

import {
  ProjectMaterialError,
  projectMaterialServiceToken,
} from '../providers/project-material.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const ACCEPTED_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function userIdOf(context: Context<AuthEnv>): string {
  const auth = context.get('auth');
  if (!auth) {
    throw new Error(
      'The authentication middleware did not populate the session.',
    );
  }
  return auth.user.id;
}

function errorResponse(
  context: Context<AuthEnv>,
  code: string,
  message: string,
  status: 400 | 404 | 413 | 415,
): Response {
  return context.json({ error: { code, message } }, status);
}

function respondWithError(context: Context<AuthEnv>, error: unknown): Response {
  if (error instanceof ProjectMaterialError) {
    return context.json(
      { error: { code: error.code, message: error.message } },
      error.status === 404 ? 404 : 400,
    );
  }
  throw error;
}

/** The declared extension and media type must both be one the application accepts today. */
function isAcceptedUpload(file: File): boolean {
  const dot = file.name.lastIndexOf('.');
  const ext = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase();
  const expected = ACCEPTED_TYPES[ext];
  if (!expected) return false;
  const declared = (file.type || '').toLowerCase();
  return (
    declared === '' ||
    declared === 'application/octet-stream' ||
    declared === expected
  );
}

function pickFileRecord(record: FileRecord, contentUrl: string): FileRecord {
  return {
    id: record.id,
    disk: record.disk,
    key: record.key,
    filename: record.filename,
    ext: record.ext,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    contentUrl,
  };
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Two application-owned surfaces the file plugin does not provide:
 *
 * - `POST /projectMaterialFiles:uploadOne` matches the plugin client manager's contract exactly, so
 *   the stock `clientFileRepositoryManagerToken` uploads without a custom adapter. It is registered
 *   here, in the application, because the plugin exposes no HTTP route for uploads at all.
 * - `GET /project-material-files/:file` streams an attachment to its owner. The file plugin's own
 *   byte route is public by design, which would let anybody with the URL read a private document.
 *
 * Both authenticate the session, and both scope by the session's user id.
 */
export const projectMaterialFilesRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(projectMaterialServiceToken);
    const files = app.container.resolve(serverFileRepositoryManagerToken);
    const required = auth.required();

    router.post(
      '/projectMaterialFiles:uploadOne',
      required,
      async (context) => {
        const contentType = (
          context.req.header('content-type') ?? ''
        ).toLowerCase();
        if (!contentType.includes('multipart/form-data')) {
          return errorResponse(
            context,
            'UNSUPPORTED_MEDIA_TYPE',
            'The upload must be sent as multipart/form-data.',
            415,
          );
        }

        let body: Record<string, unknown>;
        try {
          body = await context.req.parseBody();
        } catch {
          return errorResponse(
            context,
            'INVALID_MULTIPART',
            'The multipart body could not be read.',
            400,
          );
        }

        const uploaded = body.file;
        if (!(uploaded instanceof File)) {
          return errorResponse(
            context,
            'INVALID_FILE',
            'Exactly one File is required.',
            400,
          );
        }
        if (!isAcceptedUpload(uploaded)) {
          return errorResponse(
            context,
            'UNSUPPORTED_FILE_TYPE',
            'Only PNG images and DOCX documents may be uploaded.',
            415,
          );
        }
        if (uploaded.size > MAX_UPLOAD_BYTES) {
          return errorResponse(
            context,
            'INVALID_FILE',
            'The file is larger than the 20 MB limit.',
            400,
          );
        }

        const userId = userIdOf(context);
        try {
          const result = await files
            .repository('projectMaterialFiles', {
              disk: 'local',
              accessPath: '/api/project-material-files',
              policy: {
                read: true,
                create: { scope: true, defaults: { ownerId: userId } },
                update: false,
                delete: false,
              },
            })
            .uploadOne({ file: uploaded });

          const record = pickFileRecord(
            result.record,
            service.attachmentContentUrl(result.record.id, result.record.ext),
          );
          return context.json({ data: { ...result, record } }, 201);
        } catch (error) {
          return respondWithError(context, error);
        }
      },
    );

    router.get('/project-material-files/:file', required, async (context) => {
      const match =
        /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\.([a-zA-Z0-9]{1,32}))?$/.exec(
          context.req.param('file'),
        );
      if (!match) return context.notFound();

      try {
        const { file, stream } = await service.openAttachment(
          userIdOf(context),
          match[1],
        );

        // The served type comes from the stored extension, not the stored media type: the byte
        // route decides whether a browser treats the response as an image, and an upload's declared
        // type must never be able to turn this into a same-origin HTML document.
        const contentType =
          ACCEPTED_TYPES[file.ext] ?? 'application/octet-stream';
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(file.size),
            'Content-Disposition': contentDisposition(file.filename),
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch (error) {
        return respondWithError(context, error);
      }
    });

    return router as unknown as Hono;
  });

export default projectMaterialFilesRoutes;
