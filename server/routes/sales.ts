import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type Row } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Readable } from 'node:stream';

import {
  SalesError,
  SalesService,
  serializeFile,
  type FileAssociation,
  type FileCategory,
  type SalesViewer,
} from '../providers/sales.js';

/**
 * Sales HTTP API.
 *
 * Every path under `/sales` requires an authenticated session, and every
 * handler re-derives the caller's customer scope before touching the database.
 * The file content route is the only place bytes leave the server; it applies
 * the same customer check, so a copied link is useless to anyone who does not
 * own the customer.
 */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 5;
const UPLOAD_BODY_BYTES =
  MAX_FILES_PER_UPLOAD * MAX_FILE_BYTES + 2 * 1024 * 1024;
// A customer logo is one image of at most 5 MB; the extra megabyte covers the
// multipart envelope so an oversized body is refused while it is still being
// read instead of after it has been buffered.
const AVATAR_BODY_BYTES = MAX_FILE_BYTES + 1024 * 1024;

const DENIED_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'svg',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'php',
  'phtml',
  'exe',
  'dll',
  'com',
  'scr',
  'bat',
  'cmd',
  'sh',
  'ps1',
  'jar',
  'msi',
  'vbs',
  'apk',
  'app',
  'deb',
  'rpm',
  'so',
  'dylib',
]);

const INLINE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

export const salesApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const drive = app.container.resolve(driveManagerToken);
    const service = new SalesService(database, authorization);
    const files = app.container
      .resolve(serverFileRepositoryManagerToken)
      .repository('salesFiles', {
        connection: 'main',
        disk: 'local',
        accessPath: '/uploads/sales-files',
        policy: { read: true, create: true, update: true, delete: true },
      });

    const viewerOf = async (
      context: Context<AuthEnv>,
    ): Promise<SalesViewer> => {
      const session = context.get('auth');
      const user = session?.user as
        | { id?: string; name?: string; username?: string; email?: string }
        | undefined;
      if (!user?.id) {
        throw new SalesError(
          'UNAUTHENTICATED',
          'Authentication required.',
          401,
        );
      }
      const label = user.name || user.username || user.email || user.id;
      return service.buildViewer(String(user.id), String(label));
    };

    const removeObject = async (row: Row): Promise<void> => {
      const diskName = text(row.disk);
      const key = text(row.key);
      if (!diskName || !key) return;
      try {
        await drive.use(diskName).delete(key);
      } catch {
        // Orphaned bytes are preferable to a failed request; the row is gone either way.
      }
    };

    async function storeUpload(
      viewer: SalesViewer,
      file: File,
      association: Required<FileAssociation>,
    ): Promise<Row> {
      const { record } = await files.uploadOne({ file });
      try {
        const attached = await service.attachFile(
          viewer,
          String(record.id),
          association,
        );
        return attached;
      } catch (error) {
        await service.removeFileRow(String(record.id));
        await removeObject(record as unknown as Row);
        throw error;
      }
    }

    routes.use('*', auth.required());

    routes.onError((error, context) => {
      if (error instanceof SalesError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as 400,
        );
      }
      throw error;
    });

    // ------------------------------------------------------------------ meta

    routes.get('/owners', async (context) => {
      const viewer = await viewerOf(context);
      return context.json({ data: await service.ownerDirectory(viewer) });
    });

    routes.get('/dashboard', async (context) => {
      const viewer = await viewerOf(context);
      return context.json({ data: await service.dashboard(viewer) });
    });

    // ------------------------------------------------------------- customers

    routes.get('/customers', async (context) => {
      const viewer = await viewerOf(context);
      return context.json({
        data: await service.listCustomers(viewer, {
          q: context.req.query('q') || undefined,
          status: context.req.query('status') || undefined,
          industry: context.req.query('industry') || undefined,
          importance: context.req.query('importance') || undefined,
          ownerId: context.req.query('ownerId') || undefined,
        }),
      });
    });

    routes.post('/customers', async (context) => {
      const viewer = await viewerOf(context);
      return context.json(
        { data: await service.createCustomer(viewer, await jsonBody(context)) },
        201,
      );
    });

    routes.get('/customers/:id', async (context) => {
      const viewer = await viewerOf(context);
      const id = context.req.param('id');
      const [customer, contacts, opportunities, followUps, attachments] =
        await Promise.all([
          service.getCustomer(viewer, id),
          service.listContacts(viewer, id),
          service.listOpportunities(viewer, { customerId: id }),
          service.listFollowUps(viewer, { customerId: id }),
          service.listFiles(viewer, { customerId: id }),
        ]);
      return context.json({
        data: {
          ...customer,
          contacts,
          opportunities,
          followUps,
          files: attachments,
        },
      });
    });

    routes.patch('/customers/:id', async (context) => {
      const viewer = await viewerOf(context);
      return context.json({
        data: await service.updateCustomer(
          viewer,
          context.req.param('id'),
          await jsonBody(context),
        ),
      });
    });

    routes.post(
      '/customers/:id/avatar',
      bodyLimit({
        maxSize: AVATAR_BODY_BYTES,
        onError: (context) =>
          context.json(
            {
              code: 'BODY_TOO_LARGE',
              message: 'The image is too large. At most 5 MB is accepted.',
            },
            413,
          ),
      }),
      async (context) => {
        const viewer = await viewerOf(context);
        const customerId = context.req.param('id');
        await service.resolveFileAssociation(viewer, {
          category: 'avatar',
          customerId,
        });
        const file = await singleFile(context);
        assertAcceptable(file);
        if (!file.type.toLowerCase().startsWith('image/')) {
          throw new SalesError(
            'UNSUPPORTED_FILE_TYPE',
            'A customer logo must be an image file.',
            400,
          );
        }
        const stored = await files.uploadOne({ file });
        try {
          const replaced = await service.setCustomerAvatar(
            viewer,
            customerId,
            String(stored.record.id),
          );
          if (replaced) await removeObject(replaced);
        } catch (error) {
          await service.removeFileRow(String(stored.record.id));
          await removeObject(stored.record as unknown as Row);
          throw error;
        }
        const row = await service.fileForContent(
          viewer,
          String(stored.record.id),
        );
        return context.json({ data: serializeFile(row) }, 201);
      },
    );

    routes.delete('/customers/:id/avatar', async (context) => {
      const viewer = await viewerOf(context);
      const removed = await service.clearCustomerAvatar(
        viewer,
        context.req.param('id'),
      );
      if (removed) await removeObject(removed);
      return context.json({ data: { removed: removed ? 1 : 0 } });
    });

    // --------------------------------------------------------------- contacts

    routes.get('/customers/:id/contacts', async (context) => {
      const viewer = await viewerOf(context);
      return context.json({
        data: await service.listContacts(viewer, context.req.param('id')),
      });
    });

    routes.post('/customers/:id/contacts', async (context) => {
      const viewer = await viewerOf(context);
      return context.json(
        {
          data: await service.createContact(
            viewer,
            context.req.param('id'),
            await jsonBody(context),
          ),
        },
        201,
      );
    });

    routes.patch('/contacts/:id', async (context) => {
      const viewer = await viewerOf(context);
      return context.json({
        data: await service.updateContact(
          viewer,
          context.req.param('id'),
          await jsonBody(context),
        ),
      });
    });

    routes.delete('/contacts/:id', async (context) => {
      const viewer = await viewerOf(context);
      await service.deleteContact(viewer, context.req.param('id'));
      return context.body(null, 204);
    });

    // ---------------------------------------------------------- opportunities

    routes.get('/opportunities', async (context) => {
      const viewer = await viewerOf(context);
      return context.json({
        data: await service.listOpportunities(viewer, {
          q: context.req.query('q') || undefined,
          stage: context.req.query('stage') || undefined,
          customerId: context.req.query('customerId') || undefined,
          ownerId: context.req.query('ownerId') || undefined,
        }),
      });
    });

    routes.post('/opportunities', async (context) => {
      const viewer = await viewerOf(context);
      return context.json(
        {
          data: await service.createOpportunity(
            viewer,
            await jsonBody(context),
          ),
        },
        201,
      );
    });

    routes.get('/opportunities/:id', async (context) => {
      const viewer = await viewerOf(context);
      const id = context.req.param('id');
      const opportunity = await service.getOpportunity(viewer, id);
      const [followUps, attachments] = await Promise.all([
        service.listFollowUps(viewer, { opportunityId: id }),
        service.listFiles(viewer, { opportunityId: id }),
      ]);
      return context.json({
        data: { ...opportunity, followUps, files: attachments },
      });
    });

    routes.patch('/opportunities/:id', async (context) => {
      const viewer = await viewerOf(context);
      return context.json({
        data: await service.updateOpportunity(
          viewer,
          context.req.param('id'),
          await jsonBody(context),
        ),
      });
    });

    // -------------------------------------------------------------- followups

    routes.get('/followups', async (context) => {
      const viewer = await viewerOf(context);
      const due = context.req.query('due');
      return context.json({
        data: await service.listFollowUps(viewer, {
          customerId: context.req.query('customerId') || undefined,
          opportunityId: context.req.query('opportunityId') || undefined,
          due:
            due === 'overdue' ||
            due === 'today' ||
            due === 'upcoming' ||
            due === 'none'
              ? due
              : undefined,
        }),
      });
    });

    routes.post('/followups', async (context) => {
      const viewer = await viewerOf(context);
      return context.json(
        { data: await service.createFollowUp(viewer, await jsonBody(context)) },
        201,
      );
    });

    routes.get('/followups/:id', async (context) => {
      const viewer = await viewerOf(context);
      const id = context.req.param('id');
      const followUp = await service.getFollowUp(viewer, id);
      const attachments = await service.listFiles(viewer, { followUpId: id });
      return context.json({ data: { ...followUp, files: attachments } });
    });

    // ------------------------------------------------------------------ files

    routes.get('/files', async (context) => {
      const viewer = await viewerOf(context);
      return context.json({
        data: await service.listFiles(viewer, {
          customerId: context.req.query('customerId') || undefined,
          opportunityId: context.req.query('opportunityId') || undefined,
          followUpId: context.req.query('followUpId') || undefined,
          category: context.req.query('category') || undefined,
        }),
      });
    });

    routes.post(
      '/files',
      bodyLimit({
        maxSize: UPLOAD_BODY_BYTES,
        onError: (context) =>
          context.json(
            {
              code: 'BODY_TOO_LARGE',
              message:
                'The upload is too large. At most 5 files of 5 MB each are accepted.',
            },
            413,
          ),
      }),
      async (context) => {
        const viewer = await viewerOf(context);
        const { uploads, association } = await parseUpload(context);
        const resolved = await service.resolveFileAssociation(
          viewer,
          association,
        );

        const stored: Row[] = [];
        try {
          for (const file of uploads) {
            stored.push(await storeUpload(viewer, file, resolved));
          }
        } catch (error) {
          for (const row of stored) {
            await service.removeFileRow(String(row.id));
            await removeObject(row);
          }
          throw error;
        }
        return context.json({ data: stored }, 201);
      },
    );

    routes.delete('/files/:id', async (context) => {
      const viewer = await viewerOf(context);
      const id = context.req.param('id');
      const row = await service.requireFile(viewer, id);
      await service.deleteFile(viewer, id);
      await removeObject(row);
      return context.body(null, 204);
    });

    routes.get('/files/:id/content', async (context) => {
      const viewer = await viewerOf(context);
      const row = await service.fileForContent(viewer, context.req.param('id'));
      const diskName = text(row.disk);
      const key = text(row.key);
      const disk = drive.use(diskName);
      if (!(await disk.exists(key))) {
        return context.json(
          { code: 'NOT_FOUND', message: 'File is missing.' },
          404,
        );
      }
      const extension = text(row.ext).toLowerCase();
      const declared = text(row.mimeType);
      const inline =
        INLINE_MIME.has(declared) && !DENIED_EXTENSIONS.has(extension);
      const download = context.req.query('download') === '1';
      const filename = text(row.filename) || 'download';
      context.header(
        'Content-Type',
        inline ? declared : 'application/octet-stream',
      );
      context.header('Content-Length', String(Number(row.size) || 0));
      context.header('X-Content-Type-Options', 'nosniff');
      context.header('Content-Security-Policy', "sandbox; default-src 'none'");
      context.header('Cache-Control', 'private, no-store');
      context.header(
        'Content-Disposition',
        `${inline && !download ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeRFC5987(filename)}`,
      );
      const stream = await disk.getStream(key);
      return context.body(Readable.toWeb(stream) as unknown as ReadableStream);
    });

    router.route('/sales', routes);
    return router;
  });

async function jsonBody(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new SalesError(
        'VALIDATION_FAILED',
        'A JSON object body is required.',
        400,
      );
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SalesError) throw error;
    throw new SalesError(
      'VALIDATION_FAILED',
      'The request body is not valid JSON.',
      400,
    );
  }
}

async function parseForm(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  const contentType = context.req.header('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('multipart/form-data;')) {
    throw new SalesError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Expected multipart/form-data.',
      415,
    );
  }
  try {
    const parsed: unknown = await context.req.parseBody({ all: true });
    if (!parsed || typeof parsed !== 'object') {
      throw new SalesError(
        'INVALID_MULTIPART',
        'The uploaded form is invalid.',
        400,
      );
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SalesError) throw error;
    throw new SalesError(
      'INVALID_MULTIPART',
      'The uploaded form is invalid.',
      400,
    );
  }
}

async function singleFile(context: Context<AuthEnv>): Promise<File> {
  const body = await parseForm(context);
  const file = firstValue(body.file);
  if (!(file instanceof File)) {
    throw new SalesError('INVALID_FILE', 'Exactly one file is required.', 400);
  }
  return file;
}

async function parseUpload(
  context: Context<AuthEnv>,
): Promise<{ uploads: File[]; association: FileAssociation }> {
  const body = await parseForm(context);

  const raw = body.file;
  const candidates: unknown[] =
    raw === undefined
      ? []
      : Array.isArray(raw)
        ? [...(raw as unknown[])]
        : [raw];
  const uploads = candidates.filter(
    (value): value is File => value instanceof File,
  );
  if (uploads.length === 0 || uploads.length !== candidates.length) {
    throw new SalesError(
      'INVALID_FILES',
      'At least one valid file is required.',
      400,
    );
  }
  if (uploads.length > MAX_FILES_PER_UPLOAD) {
    throw new SalesError(
      'TOO_MANY_FILES',
      `At most ${MAX_FILES_PER_UPLOAD} files can be uploaded at once.`,
      400,
    );
  }
  for (const file of uploads) assertAcceptable(file);

  return {
    uploads,
    association: {
      category: categoryValue(body.category),
      customerId: fieldString(body.customerId),
      opportunityId: fieldString(body.opportunityId),
      followUpId: fieldString(body.followUpId),
    },
  };
}

function categoryValue(value: unknown): FileCategory {
  const candidate = fieldString(value) ?? 'avatar';
  if (
    candidate === 'avatar' ||
    candidate === 'opportunity' ||
    candidate === 'followup'
  ) {
    return candidate;
  }
  throw new SalesError('VALIDATION_FAILED', 'Unknown file category.', 400);
}

function fieldString(value: unknown): string | undefined {
  const single = firstValue(value);
  return typeof single === 'string' && single ? single : undefined;
}

/** First value of a possibly repeated multipart field, without trusting its type. */
function firstValue(value: unknown): unknown {
  if (Array.isArray(value)) return (value as unknown[])[0];
  return value;
}

function assertAcceptable(file: File): void {
  if (file.size > MAX_FILE_BYTES) {
    throw new SalesError(
      'FILE_TOO_LARGE',
      `${file.name} is larger than 5 MB and was not uploaded.`,
      400,
    );
  }
  const extension = extensionOf(file.name);
  if (extension && DENIED_EXTENSIONS.has(extension)) {
    throw new SalesError(
      'UNSUPPORTED_FILE_TYPE',
      `${file.name} has a file type that is not accepted.`,
      400,
    );
  }
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  if (index <= 0) return '';
  return name.slice(index + 1).toLowerCase();
}

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** A database value known to be a scalar, rendered as text. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

export default salesApiRoutes;
