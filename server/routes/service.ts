import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { Readable } from 'node:stream';

import {
  INSPECTION_GENERATION_TARGET,
  OVERDUE_REMINDER_TARGET,
} from '../business/scheduled-tasks.js';
import {
  createServiceAccess,
  resolveRoles,
  type ServiceAccess,
} from '../services/access.js';
import { assertAllowedAttachment } from '../services/attachment-validation.js';
import { ServiceError } from '../services/errors.js';
import { maintenanceTriggerToken } from '../services/maintenance-scheduler.js';
import { serviceDeskToken } from '../services/service-desk.js';

type ServiceEnv = AuthEnv & {
  Variables: AuthEnv['Variables'] & { serviceAccess: ServiceAccess };
};

type JsonRecord = Record<string, unknown>;

async function readJson(context: {
  req: { json(): Promise<unknown> };
}): Promise<JsonRecord> {
  try {
    const body = await context.req.json();
    return body && typeof body === 'object' ? (body as JsonRecord) : {};
  } catch {
    return {};
  }
}

function stringValue(body: JsonRecord, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value : undefined;
}

function nullableString(
  body: JsonRecord,
  key: string,
): string | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  return typeof value === 'string' ? value : null;
}

/**
 * The service desk's HTTP surface. Every handler authenticates, resolves the
 * caller's permission sets into a `ServiceAccess`, and delegates to the domain
 * service; no business rule is decided here.
 */
export function createServiceRoutes(app: Application): Hono<ServiceEnv> {
  const routes = new Hono<ServiceEnv>();
  const auth = app.container.resolve(authenticationToken);
  const database = app.container.resolve(databaseManagerToken);
  const service = app.container.resolve(serviceDeskToken);
  // Present only when the scheduler plugin is enabled. When it is, the manual
  // controls run the real Scheduler plan (same target, real occurrence record)
  // instead of calling the service directly and bypassing the Scheduler.
  const maintenance = app.container.has(maintenanceTriggerToken)
    ? app.container.resolve(maintenanceTriggerToken)
    : undefined;

  routes.use('*', auth.required());
  routes.use('*', async (context, next) => {
    const session = context.get('auth');
    const user = session?.user;
    if (!user) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const roles = await resolveRoles(database, user.id);
    const serviceAccess = createServiceAccess(
      {
        id: user.id,
        type: 'user',
        displayName: user.name || user.email || user.id,
      },
      roles,
    );
    context.set('serviceAccess', serviceAccess);
    await next();
  });

  const access = (context: Context<ServiceEnv>): ServiceAccess =>
    context.get('serviceAccess');

  const handle = async (
    context: Context<ServiceEnv>,
    operation: () => Promise<unknown>,
    status = 200,
  ): Promise<Response> => {
    try {
      return context.json({ data: await operation() }, status as 200);
    } catch (error) {
      if (error instanceof ServiceError) {
        return context.json(
          { code: error.code, message: error.message, details: error.details },
          error.status as 400,
        );
      }
      throw error;
    }
  };

  // ---- Dashboard -------------------------------------------------------

  routes.get('/dashboard', async (context) =>
    handle(context, () => service.dashboard(access(context))),
  );

  // The signed-in caller's own identity and effective service roles. The pages
  // use it to show the controls the server will actually accept; the server
  // still enforces every operation independently.
  routes.get('/me', async (context) => {
    const current = access(context);
    return context.json({
      data: {
        id: current.principal.id,
        name: current.principal.displayName,
        roles: {
          admin: current.isAdmin(),
          engineer: current.isEngineer(),
          observer: current.isObserver(),
          integrator: current.isIntegrator(),
        },
      },
    });
  });

  // ---- Customers -------------------------------------------------------

  routes.get('/customers', async (context) =>
    handle(context, () => service.listCustomers(access(context))),
  );
  routes.post('/customers', async (context) => {
    const body = await readJson(context);
    return handle(
      context,
      () =>
        service.createCustomer(access(context), {
          name: stringValue(body, 'name') ?? '',
          contactName: nullableString(body, 'contactName'),
          contactPhone: nullableString(body, 'contactPhone'),
          notes: nullableString(body, 'notes'),
        }),
      201,
    );
  });
  routes.get('/customers/:id', async (context) =>
    handle(context, () =>
      service.getCustomer(access(context), context.req.param('id')),
    ),
  );
  routes.put('/customers/:id', async (context) => {
    const body = await readJson(context);
    return handle(context, () =>
      service.updateCustomer(access(context), context.req.param('id'), {
        ...(stringValue(body, 'name') === undefined
          ? {}
          : { name: stringValue(body, 'name') }),
        ...(body.contactName === undefined
          ? {}
          : { contactName: nullableString(body, 'contactName') ?? null }),
        ...(body.contactPhone === undefined
          ? {}
          : { contactPhone: nullableString(body, 'contactPhone') ?? null }),
        ...(body.notes === undefined
          ? {}
          : { notes: nullableString(body, 'notes') ?? null }),
      }),
    );
  });
  routes.delete('/customers/:id', async (context) =>
    handle(context, async () => {
      await service.deleteCustomer(access(context), context.req.param('id'));
      return { deleted: true };
    }),
  );

  // ---- Devices ---------------------------------------------------------

  routes.get('/devices', async (context) =>
    handle(context, () => service.listDevices(access(context))),
  );
  routes.post('/devices', async (context) => {
    const body = await readJson(context);
    return handle(
      context,
      () =>
        service.createDevice(access(context), {
          code: stringValue(body, 'code') ?? '',
          name: stringValue(body, 'name') ?? '',
          customerId: stringValue(body, 'customerId') ?? '',
          serviceEngineerId: nullableString(body, 'serviceEngineerId'),
          enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
          nextInspectionAt: nullableString(body, 'nextInspectionAt'),
          notes: nullableString(body, 'notes'),
        }),
      201,
    );
  });
  routes.get('/devices/:id', async (context) =>
    handle(context, () =>
      service.getDevice(access(context), context.req.param('id')),
    ),
  );
  routes.put('/devices/:id', async (context) => {
    const body = await readJson(context);
    return handle(context, () =>
      service.updateDevice(access(context), context.req.param('id'), {
        ...(stringValue(body, 'code') === undefined
          ? {}
          : { code: stringValue(body, 'code') }),
        ...(stringValue(body, 'name') === undefined
          ? {}
          : { name: stringValue(body, 'name') }),
        ...(stringValue(body, 'customerId') === undefined
          ? {}
          : { customerId: stringValue(body, 'customerId') }),
        ...(body.serviceEngineerId === undefined
          ? {}
          : {
              serviceEngineerId:
                nullableString(body, 'serviceEngineerId') ?? null,
            }),
        ...(body.enabled === undefined
          ? {}
          : { enabled: Boolean(body.enabled) }),
        ...(body.nextInspectionAt === undefined
          ? {}
          : {
              nextInspectionAt:
                nullableString(body, 'nextInspectionAt') ?? null,
            }),
        ...(body.notes === undefined
          ? {}
          : { notes: nullableString(body, 'notes') ?? null }),
      }),
    );
  });
  routes.delete('/devices/:id', async (context) =>
    handle(context, async () => {
      await service.deleteDevice(access(context), context.req.param('id'));
      return { deleted: true };
    }),
  );

  // ---- Work orders -----------------------------------------------------

  routes.get('/work-orders', async (context) =>
    handle(context, () => service.listWorkOrders(access(context))),
  );
  routes.post('/work-orders', async (context) => {
    const body = await readJson(context);
    return handle(
      context,
      () =>
        service.createWorkOrder(access(context), {
          title: stringValue(body, 'title') ?? '',
          customerId: stringValue(body, 'customerId') ?? '',
          deviceId: stringValue(body, 'deviceId') ?? '',
          problem: stringValue(body, 'problem') ?? '',
          priority: stringValue(body, 'priority'),
          dueAt: nullableString(body, 'dueAt'),
          assigneeId: nullableString(body, 'assigneeId'),
          confidential:
            typeof body.confidential === 'boolean'
              ? body.confidential
              : undefined,
        }),
      201,
    );
  });
  routes.get('/work-orders/:id', async (context) =>
    handle(context, () =>
      service.getWorkOrder(access(context), context.req.param('id')),
    ),
  );
  routes.put('/work-orders/:id', async (context) => {
    const body = await readJson(context);
    return handle(context, () =>
      service.updateWorkOrder(access(context), context.req.param('id'), {
        ...(stringValue(body, 'title') === undefined
          ? {}
          : { title: stringValue(body, 'title') }),
        ...(stringValue(body, 'problem') === undefined
          ? {}
          : { problem: stringValue(body, 'problem') }),
        ...(stringValue(body, 'priority') === undefined
          ? {}
          : { priority: stringValue(body, 'priority') }),
        ...(body.dueAt === undefined
          ? {}
          : { dueAt: nullableString(body, 'dueAt') ?? null }),
        ...(body.assigneeId === undefined
          ? {}
          : { assigneeId: nullableString(body, 'assigneeId') ?? null }),
        ...(body.confidential === undefined
          ? {}
          : { confidential: Boolean(body.confidential) }),
      }),
    );
  });
  routes.post('/work-orders/:id/transition', async (context) => {
    const body = await readJson(context);
    const action = stringValue(body, 'action');
    return handle(context, () =>
      service.transitionWorkOrder(access(context), context.req.param('id'), {
        action: (action ?? '') as never,
        assigneeId: nullableString(body, 'assigneeId'),
        note: nullableString(body, 'note'),
        resolution: nullableString(body, 'resolution'),
        rejectionReason: nullableString(body, 'rejectionReason'),
      }),
    );
  });
  routes.post('/work-orders/:id/shares', async (context) => {
    const body = await readJson(context);
    return handle(
      context,
      () =>
        service.shareWorkOrder(
          access(context),
          context.req.param('id'),
          stringValue(body, 'engineerId') ?? '',
        ),
      201,
    );
  });
  routes.delete('/work-orders/:id/shares/:shareId', async (context) =>
    handle(context, async () => {
      await service.revokeShare(
        access(context),
        context.req.param('id'),
        context.req.param('shareId'),
      );
      return { revoked: true };
    }),
  );

  // ---- Attachments -----------------------------------------------------
  // Files are stored through the file plugin's repository (the `local` disk),
  // while the work-order link is owned by the service. Every path is
  // authenticated by the router's `auth.required()` above; content is streamed
  // back by this application rather than through a public URL, so it stays
  // version-safe and permission-checked.

  routes.get('/work-orders/:id/attachments', async (context) =>
    handle(context, () =>
      service.listAttachments(access(context), context.req.param('id')),
    ),
  );
  routes.post('/work-orders/:id/attachments', async (context) => {
    const serviceAccess = access(context);
    const body = await context.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) {
      return context.json(
        { code: 'BAD_REQUEST', message: 'file is required' },
        400,
      );
    }
    try {
      await assertAllowedAttachment(file);
    } catch (error) {
      if (error instanceof ServiceError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as 400,
        );
      }
      throw error;
    }
    const manager = app.container.resolve(serverFileRepositoryManagerToken);
    const files = manager.repository('workOrderFiles', {
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/service-files',
      policy: { read: true, create: true, update: false, delete: true },
    });
    const { record } = await files.uploadOne({ file });
    return handle(
      context,
      () =>
        service.linkAttachment(serviceAccess, context.req.param('id'), {
          fileId: record.id,
          category:
            typeof body['category'] === 'string' ? body['category'] : undefined,
        }),
      201,
    );
  });
  routes.delete('/work-orders/:id/attachments/:attachmentId', async (context) =>
    handle(context, async () => {
      await service.unlinkAttachment(
        access(context),
        context.req.param('id'),
        context.req.param('attachmentId'),
      );
      return { deleted: true };
    }),
  );
  routes.get(
    '/work-orders/:id/attachments/:attachmentId/content',
    async (context) => {
      try {
        const file = (await service.getAttachmentFile(
          access(context),
          context.req.param('id'),
          context.req.param('attachmentId'),
        )) as {
          disk: string;
          key: string;
          mimeType: string;
          filename: string;
        };
        const drive = app.container.resolve(driveManagerToken);
        const nodeStream = await drive.use(file.disk).getStream(file.key);
        const stream = Readable.toWeb(
          nodeStream,
        ) as unknown as ReadableStream<Uint8Array>;
        return new Response(stream, {
          headers: {
            'content-type': file.mimeType || 'application/octet-stream',
            'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
            'cache-control': 'private, no-store',
          },
        });
      } catch (error) {
        if (error instanceof ServiceError) {
          return context.json(
            { code: error.code, message: error.message },
            error.status as 400,
          );
        }
        throw error;
      }
    },
  );

  // ---- Inspections -----------------------------------------------------

  routes.get('/inspections', async (context) =>
    handle(context, () => service.listInspections(access(context))),
  );
  routes.post('/inspections', async (context) => {
    const body = await readJson(context);
    return handle(
      context,
      () =>
        service.createInspection(access(context), {
          deviceId: stringValue(body, 'deviceId') ?? '',
          plannedDate: stringValue(body, 'plannedDate') ?? '',
          assigneeId: nullableString(body, 'assigneeId'),
        }),
      201,
    );
  });
  routes.post('/inspections/:id/complete', async (context) => {
    const body = await readJson(context);
    return handle(context, () =>
      service.completeInspection(
        access(context),
        context.req.param('id'),
        stringValue(body, 'result') ?? '',
      ),
    );
  });

  // ---- Knowledge -------------------------------------------------------

  routes.get('/knowledge', async (context) =>
    handle(context, () => service.listKnowledge(access(context))),
  );
  routes.post('/knowledge', async (context) => {
    const body = await readJson(context);
    return handle(
      context,
      () =>
        service.createKnowledge(access(context), {
          title: stringValue(body, 'title') ?? '',
          body: stringValue(body, 'body') ?? '',
          published:
            typeof body.published === 'boolean' ? body.published : undefined,
        }),
      201,
    );
  });
  routes.put('/knowledge/:id', async (context) => {
    const body = await readJson(context);
    return handle(context, () =>
      service.updateKnowledge(access(context), context.req.param('id'), {
        ...(stringValue(body, 'title') === undefined
          ? {}
          : { title: stringValue(body, 'title') }),
        ...(stringValue(body, 'body') === undefined
          ? {}
          : { body: stringValue(body, 'body') }),
        ...(body.published === undefined
          ? {}
          : { published: Boolean(body.published) }),
      }),
    );
  });
  routes.delete('/knowledge/:id', async (context) =>
    handle(context, async () => {
      await service.deleteKnowledge(access(context), context.req.param('id'));
      return { deleted: true };
    }),
  );

  // ---- Manuals ---------------------------------------------------------

  routes.get('/manuals', async (context) =>
    handle(context, () => service.listManuals(access(context))),
  );
  routes.post('/manuals', async (context) => {
    const body = await readJson(context);
    return handle(
      context,
      () =>
        service.createManual(access(context), {
          title: stringValue(body, 'title') ?? '',
          filename: nullableString(body, 'filename'),
          content: nullableString(body, 'content'),
          status: stringValue(body, 'status'),
          failureReason: nullableString(body, 'failureReason'),
          knowledgeBaseKey: nullableString(body, 'knowledgeBaseKey'),
          documentId: nullableString(body, 'documentId'),
        }),
      201,
    );
  });
  routes.put('/manuals/:id', async (context) => {
    const body = await readJson(context);
    return handle(context, () =>
      service.updateManual(access(context), context.req.param('id'), {
        ...(stringValue(body, 'title') === undefined
          ? {}
          : { title: stringValue(body, 'title') }),
        ...(body.filename === undefined
          ? {}
          : { filename: nullableString(body, 'filename') }),
        ...(body.content === undefined
          ? {}
          : { content: nullableString(body, 'content') }),
        ...(stringValue(body, 'status') === undefined
          ? {}
          : { status: stringValue(body, 'status') }),
        ...(body.failureReason === undefined
          ? {}
          : { failureReason: nullableString(body, 'failureReason') }),
        ...(body.knowledgeBaseKey === undefined
          ? {}
          : { knowledgeBaseKey: nullableString(body, 'knowledgeBaseKey') }),
        ...(body.documentId === undefined
          ? {}
          : { documentId: nullableString(body, 'documentId') }),
      }),
    );
  });
  routes.delete('/manuals/:id', async (context) =>
    handle(context, async () => {
      await service.deleteManual(access(context), context.req.param('id'));
      return { deleted: true };
    }),
  );

  // ---- Directory -------------------------------------------------------

  routes.get('/assignees', async (context) =>
    handle(context, () => service.listAssignees()),
  );

  // ---- Maintenance (controlled immediate execution) -------------------
  // The scheduler fires these on a daily cron. A supervisor can also run one
  // on demand; when the Scheduler is enabled that run goes through the same
  // target and records the same occurrence the cron firing would, so the
  // execution history shows the real result rather than a bypassed call.

  routes.post('/maintenance/inspections/generate', async (context) => {
    if (!access(context).isAdmin()) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    return handle(context, async () => {
      if (!maintenance) return service.generateDueInspections();
      const outcome = await maintenance.runImmediately(
        INSPECTION_GENERATION_TARGET,
      );
      return { created: outcome.created };
    });
  });

  routes.post('/maintenance/reminders/run', async (context) => {
    if (!access(context).isAdmin()) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    return handle(context, async () => {
      if (!maintenance) return service.runOverdueReminders(undefined);
      const outcome = await maintenance.runImmediately(OVERDUE_REMINDER_TARGET);
      return { created: outcome.created };
    });
  });

  // ---- External integration -------------------------------------------
  // These paths share the authenticated router. An API key resolves to its
  // owner's session (the api-keys plugin enables that by default), so the
  // caller must hold the `service-integrator` permission set; the service
  // re-checks the role as well.

  routes.post('/external/reports', async (context) => {
    const serviceAccess = access(context);
    if (!serviceAccess.isIntegrator() && !serviceAccess.isAdmin()) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const body = await readJson(context);
    return handle(
      context,
      () =>
        service.submitFault(
          {
            eventNo: stringValue(body, 'eventNo') ?? '',
            customerId: nullableString(body, 'customerId'),
            deviceCode: nullableString(body, 'deviceCode'),
            title: stringValue(body, 'title') ?? '',
            problem: stringValue(body, 'problem') ?? '',
            priority: stringValue(body, 'priority'),
            confidential:
              typeof body.confidential === 'boolean'
                ? body.confidential
                : undefined,
            payload: body.payload,
          },
          {
            id: null,
            name: serviceAccess.principal.displayName,
            role: serviceAccess.isAdmin() ? 'root' : 'service-integrator',
          },
        ),
      201,
    );
  });

  routes.get('/external/reports/:eventNo', async (context) => {
    const serviceAccess = access(context);
    if (!serviceAccess.isIntegrator() && !serviceAccess.isAdmin()) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    return handle(context, () =>
      service.queryOrder(context.req.param('eventNo'), {
        id: null,
        name: serviceAccess.principal.displayName,
        role: serviceAccess.isAdmin() ? 'root' : 'service-integrator',
      }),
    );
  });

  return routes;
}
