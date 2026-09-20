import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import {
  serverFileRepositoryManagerToken,
  type ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { Readable } from 'node:stream';

import {
  LibraryError,
  LibraryService,
  type LibraryDrive,
} from '../providers/library-service.js';

const SYSTEM_ADMINISTRATOR = 'system-administrator';
const MATERIAL_FILES_COLLECTION = 'materialFiles';
const MATERIAL_FILES_ACCESS_PATH = '/uploads/material-files';
/** The drive configuration's default disk. New uploads are written here. */
const DEFAULT_DISK = 'local';

export interface LibraryRouterOptions {
  /** Authentication service used to reject anonymous requests on every path this router owns. */
  readonly auth: { required(): import('hono').MiddlewareHandler };
  readonly service: LibraryService;
  readonly files: Pick<ServerFileRepository, 'validateCollection'>;
}

interface RequestUser {
  readonly id: string;
  readonly name: string | null;
}

/**
 * Builds the library router. It owns every path under `/library` and authenticates all of them:
 * mounting under `/api` authenticates nothing on its own. Authorization is layered per operation
 * — the service rejects callers who may not read a material or who are not administrators.
 */
export function createLibraryRouter(options: LibraryRouterOptions): Hono {
  const { auth, service, files } = options;
  const router = new Hono();

  // Scoped to this router, which is mounted at `/library`; it cannot leak into other contributions.
  router.use('*', auth.required());

  const withErrorHandling = async (
    context: Context,
    handler: () => Promise<Response>,
  ): Promise<Response> => {
    try {
      return await handler();
    } catch (error) {
      if (error instanceof LibraryError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status,
        );
      }
      throw error;
    }
  };

  const idParam = (context: Context, name: string): number => {
    const value = Number(context.req.param(name));
    if (!Number.isInteger(value) || value <= 0) {
      throw new LibraryError('INVALID_INPUT', 'Invalid identifier.', 400);
    }
    return value;
  };

  router.get('/me', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      return context.json({
        data: { isAdmin: await service.isAdmin(user.id), user },
      });
    }),
  );

  router.get('/categories', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      return context.json({ data: await service.listCategories(user.id) });
    }),
  );

  router.get('/materials', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      const rows = await service.listMaterials(user.id, {
        query: context.req.query('query'),
        category: context.req.query('category'),
      });
      return context.json({ data: rows });
    }),
  );

  router.post('/materials', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      const created = await service.createMaterial(
        user.id,
        await readJson(context),
      );
      return context.json(
        { data: await service.getMaterial(user.id, created.id) },
        201,
      );
    }),
  );

  router.get('/materials/:id', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      return context.json({
        data: await service.getMaterial(user.id, idParam(context, 'id')),
      });
    }),
  );

  router.patch('/materials/:id', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      const id = idParam(context, 'id');
      await service.updateMaterial(user.id, id, await readJson(context));
      return context.json({ data: await service.getMaterial(user.id, id) });
    }),
  );

  router.delete('/materials/:id', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      await service.deleteMaterial(user.id, idParam(context, 'id'));
      return context.json({ data: { deleted: true } });
    }),
  );

  router.post('/materials/:id/files', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      const id = idParam(context, 'id');
      // Authorize before reading the body so a caller without permission never reaches the parser.
      if (!(await service.isAdmin(user.id))) {
        throw new LibraryError(
          'FORBIDDEN',
          'Only an administrator may perform this action.',
          403,
        );
      }
      // Native formData() keeps every entry of a repeated field; parseBody() would collapse them.
      const form = await context.req.formData();
      const uploads = form
        .getAll('files')
        .filter((value): value is File => typeof value !== 'string');
      const roleValue = form.get('role');
      const role = typeof roleValue === 'string' ? roleValue : 'attachment';
      // Fail with a clear error before the first write when the collection does not match.
      await files.validateCollection();
      const created = await service.uploadFiles(user.id, user.name, id, {
        files: uploads,
        role,
      });
      return context.json({ data: created }, 201);
    }),
  );

  router.delete('/materials/:id/files/:fileId', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      await service.deleteFile(
        user.id,
        idParam(context, 'id'),
        context.req.param('fileId'),
      );
      return context.json({ data: { deleted: true } });
    }),
  );

  router.post('/materials/:id/files/:fileId/cover', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      const id = idParam(context, 'id');
      await service.setCover(user.id, id, context.req.param('fileId'));
      return context.json({ data: await service.getMaterial(user.id, id) });
    }),
  );

  router.get('/files/:fileId/content', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      const { file, stream } = await service.openFile(
        user.id,
        context.req.param('fileId'),
      );
      const download = context.req.query('download') === '1';
      const size = Number(file.size);
      const headers: Record<string, string> = {
        'Content-Type': withCharset(file.mimeType, file.ext),
        'Content-Length': String(Number.isFinite(size) ? size : 0),
        'Content-Disposition': contentDisposition(file.filename, download),
        // A revoked grant must take effect on the next request, never from a cached copy.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      };
      const body = Readable.toWeb(stream) as unknown as ReadableStream;
      return context.newResponse(body, 200, headers);
    }),
  );

  router.get('/users', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      return context.json({ data: await service.listSelectableUsers(user.id) });
    }),
  );

  router.post('/materials/:id/borrowings', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      const result = await service.requestBorrow(
        user.id,
        user.name,
        idParam(context, 'id'),
      );
      return context.json({ data: result.borrowing, created: result.created });
    }),
  );

  // Registered before `/borrowings/:id/...` so the literal segment wins.
  router.get('/borrowings/mine', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      return context.json({ data: await service.listMyBorrowings(user.id) });
    }),
  );

  router.get('/borrowings', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      return context.json({
        data: await service.listBorrowings(
          user.id,
          context.req.query('status'),
        ),
      });
    }),
  );

  router.post('/borrowings/:id/borrow', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      const result = await service.confirmBorrow(
        user.id,
        idParam(context, 'id'),
      );
      return context.json({ data: result.borrowing, changed: result.changed });
    }),
  );

  router.post('/borrowings/:id/return', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      const result = await service.confirmReturn(
        user.id,
        idParam(context, 'id'),
      );
      return context.json({ data: result.borrowing, changed: result.changed });
    }),
  );

  router.post('/borrowings/:id/cancel', (context) =>
    withErrorHandling(context, async () => {
      const user = currentUser(context);
      return context.json({
        data: await service.cancelBorrow(user.id, idParam(context, 'id')),
      });
    }),
  );

  return router;
}

export const libraryApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const dependencies = createLibraryDependencies(app);
    router.route('/library', createLibraryRouter({ auth, ...dependencies }));
    return router;
  });

/** Builds the service and the file repository from the running application's container. */
export function createLibraryDependencies(app: Application): {
  service: LibraryService;
  files: ServerFileRepository;
} {
  const database = app.container.resolve<DatabaseManager>(databaseManagerToken);
  const authorization =
    app.container.resolve<AppAuthorization>(authorizationToken);
  const drive = app.container.resolve<LibraryDrive>(driveManagerToken);
  const fileManager = app.container.resolve(serverFileRepositoryManagerToken);
  const files = fileManager.repository(MATERIAL_FILES_COLLECTION, {
    connection: 'main',
    disk: DEFAULT_DISK,
    accessPath: MATERIAL_FILES_ACCESS_PATH,
    policy: { read: true, create: true, update: true, delete: true },
  });
  return {
    files,
    service: new LibraryService({
      database,
      files,
      drive,
      isAdministrator: createAdministratorChecker(authorization),
    }),
  };
}

/** An administrator is a user holding the built-in `system-administrator` permission set. */
export function createAdministratorChecker(
  authorization: Pick<AppAuthorization, 'permissionSets'>,
): (userId: string) => Promise<boolean> {
  return async (userId: string) => {
    const assignments = await authorization.permissionSets.listAssignments();
    return assignments.some(
      (assignment) =>
        assignment.subject.type === 'user' &&
        assignment.subject.id === userId &&
        assignment.permissionSet === SYSTEM_ADMINISTRATOR,
    );
  };
}

function currentUser(context: Context): RequestUser {
  const session = context.get('auth') as
    { user?: { id?: unknown; name?: unknown } } | undefined;
  const user = session?.user;
  return {
    id: typeof user?.id === 'string' ? user.id : '',
    name: typeof user?.name === 'string' ? user.name : null,
  };
}

async function readJson(context: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function contentDisposition(filename: string, download: boolean): string {
  const safe = filename.replace(/["\\\r\n]/g, '_');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function withCharset(mimeType: string, ext: string): string {
  const type =
    mimeType && mimeType.length > 0 ? mimeType : 'application/octet-stream';
  if (type.startsWith('text/') && !/charset=/i.test(type)) {
    return `${type}; charset=utf-8`;
  }
  if (type === 'application/octet-stream' && ext === 'txt') {
    return 'text/plain; charset=utf-8';
  }
  return type;
}
