import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { AppDriveConfig } from '@nocobase/drive';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  isAttachmentCategory,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_UPLOAD,
  RepairError,
  RepairService,
  type RepairCapabilities,
  type RepairPrincipal,
} from '../providers/repair-service.js';

const FAULT_TYPES = [
  'plumbing',
  'electrical',
  'hvac',
  'door_window',
  'elevator',
  'lighting',
  'network',
  'other',
] as const;

const FILE_RESOURCE_COLLECTION = 'repairFiles';
const FILE_ACCESS_PATH = '/uploads/repairs';

type RepairContext = Context<AuthEnv>;

function errorResponse(context: RepairContext, error: unknown): Response {
  if (error instanceof RepairError) {
    return context.json(
      { code: error.code, message: error.message },
      error.status as ContentfulStatusCode,
    );
  }
  throw error;
}

function body(context: RepairContext): Promise<Record<string, unknown>> {
  return context.req.json<Record<string, unknown>>().catch(() => ({}));
}

function numberParam(context: RepairContext, key: string): number {
  const value = Number(context.req.param(key));
  if (!Number.isFinite(value) || value <= 0) {
    throw new RepairError('VALIDATION', 'A valid identifier is required.');
  }
  return value;
}

function optionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function stringParam(context: RepairContext, key: string): string {
  const value = context.req.param(key);
  if (!value) {
    throw new RepairError('VALIDATION', 'A valid identifier is required.');
  }
  return value;
}

/** Exported for tests: the production route factory, unmodified. */
export function createRepairRoutes(
  app: Application,
  service: RepairService,
): Hono<AuthEnv> {
  const auth = app.container.resolve(authenticationToken);
  const drive = app.container.resolve(driveManagerToken);
  const fileManager = app.container.resolve(serverFileRepositoryManagerToken);
  const config = app.config.get<AppDriveConfig | undefined>('drive');
  const defaultDisk = config?.default ?? 'local';
  const publicBasePath = app.publicBasePath;

  const routes = new Hono<AuthEnv>();
  // This sub-router is mounted only at `/repair`, so the guard reaches nothing else.
  routes.use('*', auth.required());

  const principalOf = async (
    context: RepairContext,
  ): Promise<RepairPrincipal> => {
    const session = context.get('auth');
    if (!session?.user) {
      throw new RepairError('UNAUTHORIZED', 'Sign in to continue.');
    }
    return service.resolvePrincipal(session.user);
  };

  const contentUrl = (fileId: string): string =>
    `${publicBasePath}/api/repair/files/content/${fileId}`;

  const json =
    <T>(handler: (context: RepairContext) => Promise<T>) =>
    async (context: RepairContext): Promise<Response> => {
      try {
        const result = await handler(context);
        return context.json({ data: result ?? null });
      } catch (error) {
        return errorResponse(context, error);
      }
    };

  // ---- Session, metadata and dashboard ---------------------------------

  routes.get(
    '/session',
    json(async (context) => {
      const principal = await principalOf(context);
      const capabilities: RepairCapabilities = service.capabilities(principal);
      return { user: principal, capabilities };
    }),
  );

  routes.get(
    '/meta',
    json(async () => {
      const [buildings, rooms, equipment, materials, technicians] =
        await Promise.all([
          service.listBuildings(),
          service.listRooms(),
          service.listEquipment({}),
          service.listMaterials(),
          service.listTechnicians(),
        ]);
      return {
        buildings,
        rooms,
        equipment,
        materials,
        technicians,
        faultTypes: FAULT_TYPES,
      };
    }),
  );

  routes.get(
    '/dashboard',
    json(async (context) => {
      const principal = await principalOf(context);
      return service.dashboard(principal);
    }),
  );

  // ---- Tickets ---------------------------------------------------------

  routes.get(
    '/tickets',
    json(async (context) => {
      const principal = await principalOf(context);
      const query = context.req.query();
      return service.listTickets(principal, {
        buildingId: optionalNumber(query.buildingId),
        roomId: optionalNumber(query.roomId),
        status: query.status || undefined,
        assigneeId: query.assigneeId || undefined,
        priority: query.priority || undefined,
        keyword: query.keyword || undefined,
        overdueOnly: query.overdueOnly === 'true' || undefined,
        page: optionalNumber(query.page),
        pageSize: optionalNumber(query.pageSize),
      });
    }),
  );

  routes.post(
    '/tickets',
    json(async (context) => {
      const principal = await principalOf(context);
      const ticketId = await service.createTicket(
        principal,
        await body(context),
      );
      return { id: ticketId };
    }),
  );

  routes.get(
    '/tickets/:id',
    json(async (context) => {
      const principal = await principalOf(context);
      const detail = await service.getTicket(
        principal,
        numberParam(context, 'id'),
      );
      return {
        ...detail,
        attachments: detail.attachments.map((attachment) => ({
          ...attachment,
          contentUrl: contentUrl(attachment.fileId),
        })),
      };
    }),
  );

  const transitionRoute = (
    path: string,
    handler: (
      principal: RepairPrincipal,
      ticketId: number,
      input: Record<string, unknown>,
    ) => Promise<unknown>,
  ) =>
    routes.post(
      path,
      json(async (context) => {
        const principal = await principalOf(context);
        return handler(
          principal,
          numberParam(context, 'id'),
          await body(context),
        );
      }),
    );

  transitionRoute('/tickets/:id/dispatch', (principal, id, input) =>
    service.dispatchTicket(principal, id, input),
  );
  transitionRoute('/tickets/:id/start', (principal, id) =>
    service.startTicket(principal, id),
  );
  transitionRoute('/tickets/:id/finish', (principal, id, input) =>
    service.finishTicket(principal, id, input),
  );
  transitionRoute('/tickets/:id/accept', (principal, id, input) =>
    service.acceptTicket(principal, id, input),
  );
  transitionRoute('/tickets/:id/reject', (principal, id, input) =>
    service.rejectTicket(principal, id, input),
  );
  transitionRoute('/tickets/:id/cancel', (principal, id, input) =>
    service.cancelTicket(principal, id, input),
  );
  transitionRoute('/tickets/:id/settle', (principal, id, input) =>
    service.settleTicket(principal, id, input),
  );
  transitionRoute('/tickets/:id/materials', (principal, id, input) =>
    service
      .consumeMaterial(principal, id, input)
      .then(() => ({ ok: true as const })),
  );

  routes.post(
    '/ticket-materials/:id/return',
    json(async (context) => {
      const principal = await principalOf(context);
      return service.returnMaterial(
        principal,
        numberParam(context, 'id'),
        await body(context),
      );
    }),
  );

  // ---- Materials and assets -------------------------------------------

  routes.get(
    '/materials',
    json(async () => ({ rows: await service.listMaterials() })),
  );

  routes.post(
    '/materials/:id/stock-in',
    json(async (context) => {
      const principal = await principalOf(context);
      return service.stockInMaterial(
        principal,
        numberParam(context, 'id'),
        await body(context),
      );
    }),
  );

  routes.get(
    '/buildings',
    json(async () => ({ rows: await service.listBuildings() })),
  );

  routes.get(
    '/rooms',
    json(async () => ({ rows: await service.listRooms() })),
  );

  routes.get(
    '/equipment',
    json(async (context) => {
      const query = context.req.query();
      return {
        rows: await service.listEquipment({
          buildingId: optionalNumber(query.buildingId),
          roomId: optionalNumber(query.roomId),
          keyword: query.keyword || undefined,
        }),
      };
    }),
  );

  routes.get(
    '/equipment/:id',
    json(async (context) => {
      const principal = await principalOf(context);
      const detail = await service.getEquipmentDetail(
        principal,
        numberParam(context, 'id'),
      );
      return {
        ...detail,
        attachments: detail.attachments.map((attachment) => ({
          ...attachment,
          contentUrl: contentUrl(attachment.fileId),
        })),
      };
    }),
  );

  routes.get(
    '/settlements',
    json(async (context) => {
      const principal = await principalOf(context);
      const query = context.req.query();
      return service.listSettlements(principal, {
        keyword: query.keyword || undefined,
        buildingId: optionalNumber(query.buildingId),
        page: optionalNumber(query.page),
        pageSize: optionalNumber(query.pageSize),
      });
    }),
  );

  // ---- Files -----------------------------------------------------------

  routes.get(
    '/files',
    json(async (context) => {
      const principal = await principalOf(context);
      const query = context.req.query();
      const rows = await service.listAccessibleFiles(principal, {
        ticketId: optionalNumber(query.ticketId),
        keyword: query.keyword || undefined,
        limit: optionalNumber(query.limit),
      });
      return {
        rows: rows.map((row) => ({
          ...row,
          contentUrl: contentUrl(row.fileId),
        })),
      };
    }),
  );

  routes.post('/tickets/:id/files', async (context): Promise<Response> => {
    try {
      const principal = await principalOf(context);
      const ticketId = numberParam(context, 'id');
      await service.assertTicketWritable(principal, ticketId);
      const form = await context.req.formData();
      const category = form.get('category');
      if (!isAttachmentCategory(category)) {
        throw new RepairError(
          'VALIDATION',
          'A valid attachment category is required.',
        );
      }
      const noteValue = form.get('note');
      const note =
        typeof noteValue === 'string' && noteValue.trim()
          ? noteValue.trim()
          : null;
      const files = [...form.getAll('files'), ...form.getAll('file')].filter(
        (value): value is File => value instanceof File,
      );
      if (!files.length) {
        throw new RepairError('VALIDATION', 'Select at least one file.');
      }
      if (files.length > MAX_FILES_PER_UPLOAD) {
        throw new RepairError(
          'TOO_MANY_FILES',
          `At most ${MAX_FILES_PER_UPLOAD} files can be uploaded at once.`,
        );
      }
      const oversized = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);
      if (oversized) {
        throw new RepairError(
          'FILE_TOO_LARGE',
          `${oversized.name} exceeds the 20 MB limit.`,
        );
      }
      const repository = fileManager.repository(FILE_RESOURCE_COLLECTION, {
        disk: defaultDisk,
        accessPath: FILE_ACCESS_PATH,
        policy: {
          read: true,
          create: {
            scope: true,
            defaults: {
              uploadedById: principal.userId,
              uploadedByName: principal.name,
            },
          },
          update: false,
          delete: false,
        },
      });
      const uploaded = await repository.uploadMany({ files });
      await service.linkFiles(
        principal,
        ticketId,
        uploaded.records.map((record) => record.id),
        category,
        note,
      );
      const attachments = await service.listAttachments(ticketId);
      return context.json({
        data: {
          attachments: attachments.map((attachment) => ({
            ...attachment,
            contentUrl: contentUrl(attachment.fileId),
          })),
        },
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.patch(
    '/files/:id',
    json(async (context) => {
      const principal = await principalOf(context);
      const input = await body(context);
      await service.updateFileMeta(principal, stringParam(context, 'id'), {
        filename: input.filename,
        note: input.note,
      });
      return { ok: true };
    }),
  );

  routes.delete(
    '/files/:id',
    json(async (context) => {
      const principal = await principalOf(context);
      const removed = await service.unlinkAndDeleteFile(
        principal,
        stringParam(context, 'id'),
      );
      if (!removed) {
        throw new RepairError('NOT_FOUND', 'File not found.');
      }
      try {
        await drive.use(removed.disk).delete(removed.key);
      } catch {
        // The record and its links are gone; an unreferenced object may remain and is harmless.
      }
      return { ok: true };
    }),
  );

  // The bytes route. Access is decided on every request from current ticket access, so a URL that worked before a
  // reassignment or a deletion stops working afterwards.
  routes.get('/files/content/:id', async (context): Promise<Response> => {
    try {
      const principal = await principalOf(context);
      const fileId = stringParam(context, 'id');
      const access = await service.canAccessFile(principal, fileId);
      if (access !== 'ok') {
        return context.json(
          {
            code: access === 'missing' ? 'NOT_FOUND' : 'FORBIDDEN',
            message:
              access === 'missing'
                ? 'File not found.'
                : 'You cannot read this file.',
          },
          access === 'missing' ? 404 : 403,
        );
      }
      const record = await service.getFileRecord(fileId);
      if (!record) {
        return context.json(
          { code: 'NOT_FOUND', message: 'File not found.' },
          404,
        );
      }
      let bytes: Uint8Array;
      try {
        bytes = await drive.use(record.disk).getBytes(record.key);
      } catch {
        return context.json(
          { code: 'NOT_FOUND', message: 'The stored file is unavailable.' },
          404,
        );
      }
      const download = context.req.query().download === '1';
      const inlineSafe =
        record.mimeType.startsWith('image/') ||
        record.mimeType === 'application/pdf';
      return new Response(bytes.buffer as ArrayBuffer, {
        status: 200,
        headers: {
          'content-type': record.mimeType || 'application/octet-stream',
          'content-length': String(bytes.byteLength),
          'content-disposition': `${download || !inlineSafe ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox",
        },
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  return routes;
}

const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const service = new RepairService(
      app.container.resolve(databaseManagerToken),
    );
    router.route('/repair', createRepairRoutes(app, service));
    return router;
  },
);

export default apiRoutes;
