import { Readable } from 'node:stream';

import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  FileRepositoryError,
  serverFileRepositoryManagerToken,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  dataResponse,
  defineApiRoutes,
  defineRootRoutes,
  describeRoute,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import {
  ProjectCollaborationError,
  projectsServiceToken,
} from '../providers/projects.js';
import { toApiError } from './collaboration.js';
import { UploadedFileSchema } from './schemas.js';

const DOMAIN = 'projectCollaboration';

/**
 * The content route answers the same domain errors as the collaboration API; without this translation a
 * `ProjectCollaborationError` (for example a member who is neither the submitter, the owner, nor a share holder) is
 * not recognized by `apiErrorHandler`, which rethrows it and turns a permission denial into an opaque 500.
 */
function mapDomainError(error: unknown): unknown {
  return error instanceof ProjectCollaborationError ? toApiError(error) : error;
}

const uploadError = (reason: string, message: string): ApiError =>
  new ApiError({ status: 'INVALID_ARGUMENT', reason, domain: DOMAIN, message });

/**
 * Uploads into the deliverable file table.
 *
 * The application owns this route instead of exposing the file plugin's own upload endpoint so that the only writer
 * is a signed-in collaborator, and so the returned record can be linked to a deliverable in the same flow. The bytes
 * are stored through the file plugin's server repository, which composes every column of the row.
 */
export const deliverableFileUploadApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthEnv>();
    const root = new Hono();
    const auth = app.container.resolve(authenticationToken);

    router.use('/deliverableFiles/upload', auth.required());
    router.onError((error, context) =>
      apiErrorHandler(mapDomainError(error), context),
    );

    router.post(
      '/deliverableFiles/upload',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Upload the file of a deliverable',
        operationId: 'uploadDeliverableFile',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '201': dataResponse(UploadedFileSchema),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
          '400': apiErrorResponse(
            400,
            'The body is not multipart or holds no file (`INVALID_FILE`).',
          ),
        },
      }),
      async (context) => {
        let body: Record<string, unknown>;
        try {
          body = await context.req.parseBody();
        } catch {
          throw uploadError(
            'INVALID_FILE',
            'The request body must be multipart/form-data holding one `file`.',
          );
        }
        const file = body.file;
        if (!(file instanceof File)) {
          throw uploadError(
            'INVALID_FILE',
            'The request body must be multipart/form-data holding one `file`.',
          );
        }
        const files = app.container
          .resolve(serverFileRepositoryManagerToken)
          .repository('deliverable_files', {
            disk: 'local',
            accessPath: '/uploads/deliverableFiles',
            policy: { read: true, create: true, update: false, delete: false },
          });
        try {
          const result = await files.uploadOne({ file });
          return context.json({ data: result.record }, 201);
        } catch (error) {
          if (error instanceof FileRepositoryError) {
            throw uploadError(error.code, error.message);
          }
          throw error;
        }
      },
    );

    root.route('/', router);
    return root;
  });

/**
 * The delivered bytes.
 *
 * This is deliberately the application's own root route rather than the file plugin's public content path: the file
 * plugin serves anyone holding a UUID, which is the opposite of what "shared with a colleague, until the share is
 * revoked" means. Access is decided by the service — the submitter, the project owner, or the holder of an active
 * share — before the disk is touched at all.
 */
export const deliverableContentRootRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes((app) => {
    const router = new Hono<AuthEnv>();
    const root = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const database = app.container.resolve(databaseManagerToken);
    const drive = app.container.resolve(driveManagerToken);

    router.use('/deliverables/*', auth.required());
    router.onError((error, context) =>
      apiErrorHandler(mapDomainError(error), context),
    );

    router.get(
      '/deliverables/:deliverableId/content',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Stream the file of a deliverable the caller may access',
        operationId: 'getDeliverableContent',
        responses: {
          '200': {
            description: 'The file bytes.',
            content: { 'application/octet-stream': {} },
          },
          '401': apiErrorResponse(401),
          '403': apiErrorResponse(403),
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      async (context: Context<AuthEnv>) => {
        const deliverableId = context.req.param('deliverableId');
        if (!deliverableId) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'DELIVERABLE_NOT_FOUND',
            domain: DOMAIN,
            message: 'The deliverable was not found.',
          });
        }
        const service = app.container.resolve(projectsServiceToken);
        const userId = context.get('auth')!.user.id;
        const access = await service.assertDeliverableContentAccess(
          deliverableId,
          userId,
        );
        if (!access.fileId) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'DELIVERABLE_FILE_MISSING',
            domain: DOMAIN,
            message: 'The deliverable has no file attached.',
          });
        }
        const record = await database
          .repository<{
            id: string;
            disk: string;
            key: string;
            filename: string;
            ext: string;
            mimeType: string;
            size: number | string;
          }>('deliverable_files')
          .findOne({ filter: { id: access.fileId } });
        if (!record) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'FILE_NOT_FOUND',
            domain: DOMAIN,
            message: 'The delivered file was not found.',
          });
        }
        const disk = drive.use(record.disk);
        if (!(await disk.exists(record.key))) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'FILE_NOT_FOUND',
            domain: DOMAIN,
            message: 'The delivered file was not found in storage.',
          });
        }
        const disposition =
          context.req.query('download') === '1' ? 'attachment' : 'inline';
        context.header('Cache-Control', 'private, no-store');
        context.header('Content-Type', record.mimeType);
        context.header('Content-Length', String(record.size));
        context.header('X-Content-Type-Options', 'nosniff');
        context.header(
          'Content-Disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(
            Buffer.from(record.filename).toString('utf8'),
          ).replace(
            /['()*]/g,
            (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
          )}`,
        );
        return context.body(Readable.toWeb(await disk.getStream(record.key)));
      },
    );

    root.route('/', router);
    return root;
  });
