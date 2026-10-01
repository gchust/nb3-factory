import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import {
  createServiceAccess,
  resolveRoles,
  type ServiceAccess,
} from '../services/access.js';
import { ServiceError } from '../services/errors.js';
import {
  serviceDeskToken,
  type ServiceDesk,
} from '../services/service-desk.js';

type ResourceEnv = AuthEnv & {
  Variables: AuthEnv['Variables'] & { serviceAccess: ServiceAccess };
};

type JsonRecord = Record<string, unknown>;

function recordBody(body: JsonRecord): JsonRecord {
  const values = body['values'];
  return values && typeof values === 'object' ? (values as JsonRecord) : body;
}

function readString(body: JsonRecord, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value : undefined;
}

function readNullableString(
  body: JsonRecord,
  key: string,
): string | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  return typeof value === 'string' ? value : null;
}

function readBoolean(body: JsonRecord, key: string): boolean | undefined {
  const value = body[key];
  return typeof value === 'boolean' ? value : undefined;
}

interface ResourceAdapter {
  list(access: ServiceAccess): Promise<unknown>;
  get(access: ServiceAccess, id: string): Promise<unknown>;
  create?(access: ServiceAccess, body: JsonRecord): Promise<unknown>;
  update?(
    access: ServiceAccess,
    id: string,
    body: JsonRecord,
  ): Promise<unknown>;
  remove?(access: ServiceAccess, id: string): Promise<void>;
}

function adapters(service: ServiceDesk): Record<string, ResourceAdapter> {
  return {
    customers: {
      list: (access) => service.listCustomers(access),
      get: (access, id) => service.getCustomer(access, id),
      create: (access, body) =>
        service.createCustomer(access, {
          name: readString(body, 'name') ?? '',
          contactName: readNullableString(body, 'contactName'),
          contactPhone: readNullableString(body, 'contactPhone'),
          notes: readNullableString(body, 'notes'),
        }),
      update: (access, id, body) =>
        service.updateCustomer(access, id, {
          ...(readString(body, 'name') === undefined
            ? {}
            : { name: readString(body, 'name') }),
          ...(body['contactName'] === undefined
            ? {}
            : { contactName: readNullableString(body, 'contactName') ?? null }),
          ...(body['contactPhone'] === undefined
            ? {}
            : {
                contactPhone: readNullableString(body, 'contactPhone') ?? null,
              }),
          ...(body['notes'] === undefined
            ? {}
            : { notes: readNullableString(body, 'notes') ?? null }),
        }),
      remove: (access, id) => service.deleteCustomer(access, id),
    },
    devices: {
      list: (access) => service.listDevices(access),
      get: (access, id) => service.getDevice(access, id),
      create: (access, body) =>
        service.createDevice(access, {
          code: readString(body, 'code') ?? '',
          name: readString(body, 'name') ?? '',
          customerId: readString(body, 'customerId') ?? '',
          serviceEngineerId: readNullableString(body, 'serviceEngineerId'),
          enabled: readBoolean(body, 'enabled'),
          nextInspectionAt: readNullableString(body, 'nextInspectionAt'),
          notes: readNullableString(body, 'notes'),
        }),
      update: (access, id, body) =>
        service.updateDevice(access, id, {
          ...(readString(body, 'code') === undefined
            ? {}
            : { code: readString(body, 'code') }),
          ...(readString(body, 'name') === undefined
            ? {}
            : { name: readString(body, 'name') }),
          ...(readString(body, 'customerId') === undefined
            ? {}
            : { customerId: readString(body, 'customerId') }),
          ...(body['serviceEngineerId'] === undefined
            ? {}
            : {
                serviceEngineerId:
                  readNullableString(body, 'serviceEngineerId') ?? null,
              }),
          ...(body['enabled'] === undefined
            ? {}
            : { enabled: Boolean(body['enabled']) }),
          ...(body['nextInspectionAt'] === undefined
            ? {}
            : {
                nextInspectionAt:
                  readNullableString(body, 'nextInspectionAt') ?? null,
              }),
          ...(body['notes'] === undefined
            ? {}
            : { notes: readNullableString(body, 'notes') ?? null }),
        }),
      remove: (access, id) => service.deleteDevice(access, id),
    },
    workOrders: {
      list: (access) => service.listWorkOrders(access),
      get: (access, id) => service.getWorkOrder(access, id),
      create: (access, body) =>
        service.createWorkOrder(access, {
          title: readString(body, 'title') ?? '',
          customerId: readString(body, 'customerId') ?? '',
          deviceId: readString(body, 'deviceId') ?? '',
          problem: readString(body, 'problem') ?? '',
          priority: readString(body, 'priority'),
          dueAt: readNullableString(body, 'dueAt'),
          assigneeId: readNullableString(body, 'assigneeId'),
          confidential: readBoolean(body, 'confidential'),
        }),
      update: (access, id, body) =>
        service.updateWorkOrder(access, id, {
          ...(readString(body, 'title') === undefined
            ? {}
            : { title: readString(body, 'title') }),
          ...(readString(body, 'problem') === undefined
            ? {}
            : { problem: readString(body, 'problem') }),
          ...(readString(body, 'priority') === undefined
            ? {}
            : { priority: readString(body, 'priority') }),
          ...(body['dueAt'] === undefined
            ? {}
            : { dueAt: readNullableString(body, 'dueAt') ?? null }),
          ...(body['assigneeId'] === undefined
            ? {}
            : { assigneeId: readNullableString(body, 'assigneeId') ?? null }),
          ...(body['confidential'] === undefined
            ? {}
            : { confidential: Boolean(body['confidential']) }),
        }),
      remove: undefined,
    },
    inspections: {
      list: (access) => service.listInspections(access),
      get: async (access, id) => {
        const rows = (await service.listInspections(access)) as {
          id: string;
        }[];
        const found = rows.find((row) => row.id === id);
        if (!found) throw new Error('Inspection not found');
        return found;
      },
      create: (access, body) =>
        service.createInspection(access, {
          deviceId: readString(body, 'deviceId') ?? '',
          plannedDate: readString(body, 'plannedDate') ?? '',
          assigneeId: readNullableString(body, 'assigneeId'),
        }),
    },
    knowledgeArticles: {
      list: (access) => service.listKnowledge(access),
      get: async (access, id) => {
        const rows = (await service.listKnowledge(access)) as {
          id: string;
        }[];
        const found = rows.find((row) => row.id === id);
        if (!found) throw new Error('Knowledge article not found');
        return found;
      },
      create: (access, body) =>
        service.createKnowledge(access, {
          title: readString(body, 'title') ?? '',
          body: readString(body, 'body') ?? '',
          published: readBoolean(body, 'published'),
        }),
      remove: (access, id) => service.deleteKnowledge(access, id),
    },
    deviceManuals: {
      list: (access) => service.listManuals(access),
      get: async (access, id) => {
        const rows = (await service.listManuals(access)) as { id: string }[];
        const found = rows.find((row) => row.id === id);
        if (!found) throw new Error('Manual not found');
        return found;
      },
      create: (access, body) =>
        service.createManual(access, {
          title: readString(body, 'title') ?? '',
          filename: readNullableString(body, 'filename'),
          content: readNullableString(body, 'content'),
          status: readString(body, 'status'),
        }),
      remove: (access, id) => service.deleteManual(access, id),
    },
  };
}

/**
 * NocoBase-style collection aliases (`GET /api/customers:list`). The
 * application's pages call `/api/service/...`; these aliases exist so the
 * standard collection URL shape resolves to the same permission-checked
 * service instead of falling through to the single-page shell. Every handler
 * runs the same authentication and record scoping as the primary routes.
 */
export function createResourceRoutes(app: Application): Hono<ResourceEnv> {
  const routes = new Hono<ResourceEnv>();
  const auth = app.container.resolve(authenticationToken);
  const database = app.container.resolve(databaseManagerToken);
  const service = app.container.resolve(serviceDeskToken);
  const resources = adapters(service);

  // Authentication is attached to each alias individually, never with a
  // catch-all `use('*')`: this contribution is mounted at `/api`, so a wildcard
  // middleware would answer 401 for every unregistered API path instead of
  // letting it fall through to the SPA shell.
  const authenticated = auth.required();
  const withServiceAccess: MiddlewareHandler<ResourceEnv> = async (
    context,
    next,
  ) => {
    const session = context.get('auth');
    const user = session?.user;
    if (!user) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const roles = await resolveRoles(database, user.id);
    context.set(
      'serviceAccess',
      createServiceAccess(
        {
          id: user.id,
          type: 'user',
          displayName: user.name || user.email || user.id,
        },
        roles,
      ),
    );
    await next();
  };

  const access = (context: Context<ResourceEnv>): ServiceAccess =>
    context.get('serviceAccess');

  const fail = (context: Context<ResourceEnv>, error: unknown): Response => {
    if (error instanceof ServiceError) {
      return context.json(
        { code: error.code, message: error.message, details: error.details },
        error.status as 400,
      );
    }
    return context.json(
      {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Request failed',
      },
      400,
    );
  };

  for (const [name, adapter] of Object.entries(resources)) {
    routes.get(
      `/${name}:list`,
      authenticated,
      withServiceAccess,
      async (context) => {
        try {
          const rows = await adapter.list(access(context));
          return context.json({
            data: rows,
            meta: { count: Array.isArray(rows) ? rows.length : undefined },
          });
        } catch (error) {
          return fail(context, error);
        }
      },
    );

    routes.get(
      `/${name}:get`,
      authenticated,
      withServiceAccess,
      async (context) => {
        const id = context.req.query('filterByTk') ?? '';
        try {
          return context.json({ data: await adapter.get(access(context), id) });
        } catch (error) {
          return fail(context, error);
        }
      },
    );

    if (adapter.create) {
      const create = adapter.create.bind(adapter);
      routes.post(
        `/${name}:create`,
        authenticated,
        withServiceAccess,
        async (context) => {
          let body: JsonRecord = {};
          try {
            const parsed: unknown = await context.req.json();
            if (parsed && typeof parsed === 'object') {
              body = parsed as JsonRecord;
            }
          } catch {
            body = {};
          }
          try {
            return context.json(
              { data: await create(access(context), recordBody(body)) },
              201,
            );
          } catch (error) {
            return fail(context, error);
          }
        },
      );
    }

    if (adapter.update) {
      const update = adapter.update.bind(adapter);
      routes.post(
        `/${name}:update`,
        authenticated,
        withServiceAccess,
        async (context) => {
          const id = context.req.query('filterByTk') ?? '';
          let body: JsonRecord = {};
          try {
            const parsed: unknown = await context.req.json();
            if (parsed && typeof parsed === 'object') {
              body = parsed as JsonRecord;
            }
          } catch {
            body = {};
          }
          try {
            return context.json({
              data: await update(access(context), id, recordBody(body)),
            });
          } catch (error) {
            return fail(context, error);
          }
        },
      );
    }

    if (adapter.remove) {
      const remove = adapter.remove.bind(adapter);
      routes.post(
        `/${name}:destroy`,
        authenticated,
        withServiceAccess,
        async (context) => {
          const id = context.req.query('filterByTk') ?? '';
          try {
            await remove(access(context), id);
            return context.json({ data: { deleted: true } });
          } catch (error) {
            return fail(context, error);
          }
        },
      );
    }
  }

  return routes;
}
