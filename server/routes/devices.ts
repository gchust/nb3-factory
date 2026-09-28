import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type RepositoryPolicy } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import type { Device } from '../devices-resources.js';

/**
 * The authentication and authorization middleware install `auth` and `authz` on the Hono context of every request they
 * guard. Declaring them once lets this route read what the middleware it installed just wrote, without a cast.
 */
declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthEnv['Variables']['auth'];
    authz: AuthorizationEnv['Variables']['authz'];
  }
}

const DEVICE_COLLECTION = 'devices';
const DEVICE_RESOURCE_ID = 'devices';
const MAX_CODE_LENGTH = 64;
const MAX_NAME_LENGTH = 128;

type DeviceAction = 'view' | 'create' | 'edit' | 'delete';

const OPERATIONS: Readonly<
  Record<DeviceAction, 'read' | 'create' | 'update' | 'delete'>
> = {
  view: 'read',
  create: 'create',
  edit: 'update',
  delete: 'delete',
};

type DeviceInput = Pick<Device, 'code' | 'name'>;

function forbidden(context: Context): Response {
  return context.json(
    { code: 'FORBIDDEN', message: 'Device access is required.' },
    403,
  );
}

function notFound(context: Context): Response {
  return context.json({ code: 'NOT_FOUND', message: 'Device not found.' }, 404);
}

function invalidInput(context: Context): Response {
  return context.json(
    {
      code: 'INVALID_INPUT',
      message: `code and name are required, code at most ${MAX_CODE_LENGTH} characters and name at most ${MAX_NAME_LENGTH}.`,
    },
    400,
  );
}

function duplicateCode(context: Context, code: string): Response {
  return context.json(
    {
      code: 'DUPLICATE_CODE',
      message: `A device with code ${code} already exists.`,
    },
    409,
  );
}

/**
 * Accepts exactly the two business fields. A missing field, an empty value, or a value past the column length is a
 * caller mistake, not a server error, so it is rejected as `INVALID_INPUT`.
 */
function parseDeviceInput(value: unknown): DeviceInput | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const { code, name } = value as { code?: unknown; name?: unknown };
  if (
    typeof code !== 'string' ||
    code.trim().length === 0 ||
    code.trim().length > MAX_CODE_LENGTH
  ) {
    return undefined;
  }
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    name.trim().length > MAX_NAME_LENGTH
  ) {
    return undefined;
  }
  return { code: code.trim(), name: name.trim() };
}

function toDevice(record: unknown): Device {
  const value = record as Record<string, unknown>;
  return {
    id: Number(value.id),
    code: String(value.code),
    name: String(value.name),
  };
}

function parseDeviceId(context: Context): number | undefined {
  const id = Number(context.req.param('id'));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Authorizes one device action and returns the database policy it resolved. A denied decision, an unregistered
 * Collection, or a policy that forbids this operation all mean the caller may not perform it.
 *
 * `conditional` is the normal outcome, not a denial: a composite action folds into one database policy per check, and
 * an unrestricted identity (root) yields a conditional decision whose policy allows everything.
 */
async function devicePolicy(
  context: Context,
  action: DeviceAction,
): Promise<RepositoryPolicy | undefined> {
  const decision = await context.get('authz').authorize({
    resource: { type: 'composite', id: DEVICE_RESOURCE_ID },
    action,
  });
  if (decision.effect === 'deny') return undefined;
  const policy = decision.conditions?.database?.[DEVICE_COLLECTION];
  if (!policy || policy[OPERATIONS[action]] === false) return undefined;
  return policy;
}
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const routes = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);

    routes.use('*', authentication.required(), authorization.middleware());

    routes.get('/', async (context) => {
      const policy = await devicePolicy(context, 'view');
      if (!policy) return forbidden(context);
      const records = await database
        .repository(DEVICE_COLLECTION)
        .withPolicy(policy)
        .findMany({ sort: (sort) => sort.field('code').asc() });
      return context.json({ data: records.map(toDevice) });
    });

    routes.post('/', async (context) => {
      const policy = await devicePolicy(context, 'create');
      if (!policy) return forbidden(context);

      const input = parseDeviceInput(
        await context.req.json().catch(() => undefined),
      );
      if (!input) return invalidInput(context);

      // A create policy permits no reads, so the advisory duplicate check runs under a separate read authorization.
      // The unique column is the actual guarantee; this only turns a driver error into a clear conflict.
      const readPolicy = await devicePolicy(context, 'view');
      if (readPolicy && readPolicy.read !== false) {
        const existing = await database
          .repository(DEVICE_COLLECTION)
          .withPolicy(readPolicy)
          .findMany({ filter: { code: input.code } });
        if (existing.length > 0) return duplicateCode(context, input.code);
      }

      const { record } = await database
        .repository(DEVICE_COLLECTION)
        .withPolicy(policy)
        .createOne({ values: input });
      return context.json({ data: toDevice(record) }, 201);
    });

    routes.put('/:id', async (context) => {
      const id = parseDeviceId(context);
      if (id === undefined) return invalidInput(context);

      const policy = await devicePolicy(context, 'edit');
      if (!policy) return forbidden(context);

      const input = parseDeviceInput(
        await context.req.json().catch(() => undefined),
      );
      if (!input) return invalidInput(context);

      // An edit policy permits no reads either, so existence and duplicate checks use the read policy.
      const readPolicy = await devicePolicy(context, 'view');
      if (readPolicy && readPolicy.read !== false) {
        const readable = database
          .repository(DEVICE_COLLECTION)
          .withPolicy(readPolicy);
        const existing = await readable.findMany({ filter: { id } });
        if (existing.length === 0) return notFound(context);
        const duplicate = await readable.findMany({
          filter: { code: input.code },
        });
        if (duplicate.some((record) => Number(record.id) !== id)) {
          return duplicateCode(context, input.code);
        }
      }

      const { record } = await database
        .repository(DEVICE_COLLECTION)
        .withPolicy(policy)
        .updateOne({ filter: { id }, values: input });
      return context.json({ data: toDevice(record) });
    });

    routes.delete('/:id', async (context) => {
      const id = parseDeviceId(context);
      if (id === undefined) return invalidInput(context);

      const policy = await devicePolicy(context, 'delete');
      if (!policy) return forbidden(context);

      const readPolicy = await devicePolicy(context, 'view');
      if (readPolicy && readPolicy.read !== false) {
        const existing = await database
          .repository(DEVICE_COLLECTION)
          .withPolicy(readPolicy)
          .findMany({ filter: { id } });
        if (existing.length === 0) return notFound(context);
      }

      await database
        .repository(DEVICE_COLLECTION)
        .withPolicy(policy)
        .deleteOne({ filter: { id } });
      return context.json({ data: { id } });
    });

    router.route('/devices', routes);
    return router;
  },
);
