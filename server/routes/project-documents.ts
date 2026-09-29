import { Readable } from 'node:stream';

import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { FileRepositoryError } from '@nocobase/app-plugin-file/server';
import { defineApiRoutes } from '@nocobase/app-server/router';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  ProjectDocumentError,
  projectDocumentServiceToken,
  type ProjectDocumentErrorCode,
  type ProjectDocumentInput,
  type ProjectDocumentService,
} from '../providers/project-documents.js';

/**
 * The HTTP surface of Project documents.
 *
 * Every path below is behind `auth.required()`, so an anonymous caller reaches
 * no handler at all. Ownership is not decided here: the service filters every
 * read and write by the session user's id, and answers a stranger's request as
 * if the record did not exist.
 */

const STATUS_BY_CODE: Readonly<
  Record<ProjectDocumentErrorCode, ContentfulStatusCode>
> = {
  DOCUMENT_NOT_FOUND: 404,
  FILE_NOT_FOUND: 404,
  FILE_ALREADY_ATTACHED: 409,
  INVALID_TITLE: 400,
  UNSUPPORTED_FILE_TYPE: 415,
};

const INVALID_FILE_CODES: ReadonlySet<string> = new Set([
  'INVALID_FILE',
  'INVALID_FILES',
  'INVALID_FILE_METADATA',
  'INVALID_FILE_COLLECTION',
]);

function errorResponse(
  context: Context<AuthEnv>,
  error: unknown,
): Response | Promise<Response> {
  if (error instanceof ProjectDocumentError) {
    return context.json(
      { code: error.code, message: error.message },
      STATUS_BY_CODE[error.code],
    );
  }
  if (error instanceof FileRepositoryError) {
    return context.json(
      { code: error.code, message: error.message },
      INVALID_FILE_CODES.has(error.code) ? 400 : 500,
    );
  }
  throw error;
}

function ownerIdOf(context: Context<AuthEnv>): string {
  const session = context.get('auth');
  if (!session) throw new Error('Authentication is required.');
  return session.user.id;
}

function readInput(body: unknown): ProjectDocumentInput {
  const value = (body ?? {}) as { title?: unknown; fileIds?: unknown };
  return {
    title: typeof value.title === 'string' ? value.title : '',
    fileIds: Array.isArray(value.fileIds)
      ? value.fileIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

function contentDisposition(filename: string): string {
  const encoded = encodeURIComponent(
    Buffer.from(filename).toString('utf8'),
  ).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

export const apiRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const service: ProjectDocumentService = app.container.resolve(
    projectDocumentServiceToken,
  );

  const scoped = new Hono<AuthEnv>();
  scoped.use('*', auth.required());

  scoped.get('/', async (context) => {
    try {
      return context.json({ data: await service.list(ownerIdOf(context)) });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  scoped.post('/', async (context) => {
    try {
      const body = await context.req.json<unknown>().catch(() => undefined);
      return context.json(
        {
          data: await service.create(ownerIdOf(context), readInput(body)),
        },
        201,
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  scoped.post('/files', async (context) => {
    try {
      let body: Record<string, unknown>;
      try {
        body = await context.req.parseBody();
      } catch {
        return context.json(
          { code: 'INVALID_MULTIPART', message: 'Invalid multipart body.' },
          400,
        );
      }
      const file = body.file;
      if (!(file instanceof File)) {
        return context.json(
          { code: 'INVALID_FILE', message: 'Exactly one File is required.' },
          400,
        );
      }
      return context.json({
        data: await service.upload(ownerIdOf(context), file),
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  scoped.get('/files/:id/content', async (context) => {
    try {
      const attachment = await service.readAttachment(
        ownerIdOf(context),
        context.req.param('id'),
      );
      if (!attachment) {
        throw new ProjectDocumentError(
          'FILE_NOT_FOUND',
          'The attachment does not exist.',
        );
      }
      context.header(
        'Content-Type',
        attachment.mimeType || 'application/octet-stream',
      );
      context.header('Content-Length', String(attachment.size));
      context.header('Cache-Control', 'private, no-store');
      context.header('X-Content-Type-Options', 'nosniff');
      context.header('Content-Security-Policy', "sandbox; default-src 'none'");
      context.header(
        'Content-Disposition',
        contentDisposition(attachment.filename),
      );
      return context.body(Readable.toWeb(attachment.stream));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  scoped.get('/:id', async (context) => {
    try {
      return context.json({
        data: await service.get(ownerIdOf(context), context.req.param('id')),
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  scoped.patch('/:id', async (context) => {
    try {
      const body = await context.req.json<unknown>().catch(() => undefined);
      return context.json({
        data: await service.update(
          ownerIdOf(context),
          context.req.param('id'),
          readInput(body),
        ),
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  scoped.delete('/:id', async (context) => {
    try {
      await service.remove(ownerIdOf(context), context.req.param('id'));
      return context.body(null, 204);
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  router.route('/project-documents', scoped);
  return router;
});

export default apiRoutes;
