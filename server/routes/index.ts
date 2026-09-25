import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationScope,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import {
  databaseManagerToken,
  type Repository,
  type RepositoryPolicy,
} from '@nocobase/db';
import { Hono, type Context } from 'hono';

import {
  DEVICES_COLLECTION,
  DEVICE_RESOURCE,
  type DeviceRow,
} from '../devices/authorization.js';

type DeviceCreate = DeviceRow;
type DeviceUpdate = Partial<Pick<DeviceRow, 'code' | 'name' | 'updatedAt'>>;
type DeviceRepository = Repository<DeviceRow, DeviceCreate, DeviceUpdate>;

const CODE_MAX_LENGTH = 64;
const NAME_MAX_LENGTH = 255;

/**
 * A small CRUD API for the device inventory. Every path enforces its own
 * security: `authentication.required()` establishes the session (a session
 * cookie or a user-bound API key), `authorization.middleware()` resolves it into
 * a request scope, and each handler authorizes the matching business action
 * before touching the Repository with its Policy.
 *
 * The external integration account is granted only `view`, so `create`, `edit`
 * and `delete` return 403 for it — and because the denial happens before the
 * Repository is used, no write reaches the table.
 */
export function createDeviceRoutes(app: Application): Hono {
  const router = new Hono();
  const authentication = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const database = app.container.resolve(databaseManagerToken);

  const devices = new Hono<AuthEnv>();
  // Scoped to this isolated sub-router, so the middleware never leaks into a
  // contribution mounted after this one.
  devices.use('*', authentication.required());
  devices.use('*', authorization.middleware());

  const repositoryFor = async (
    context: Context,
    action: 'view' | 'create' | 'edit' | 'delete',
  ): Promise<DeviceRepository | undefined> => {
    const authz = context.get('authz') as AuthorizationScope;
    const decision = await authz.authorize({
      resource: DEVICE_RESOURCE,
      action,
    });
    if (decision.effect === 'deny') {
      return undefined;
    }
    const conditions = decision.conditions as
      | { database?: Readonly<Record<string, RepositoryPolicy<DeviceRow>>> }
      | undefined;
    const policy = conditions?.database?.[DEVICES_COLLECTION];
    const repository = database
      .connection()
      .repository<DeviceRow, DeviceCreate, DeviceUpdate>(DEVICES_COLLECTION);
    // An unrestricted identity returns a Policy with an open scope, so the
    // scoped path covers both cases; the raw repository is only a guard for a
    // decision that carried no database conditions at all.
    return (policy
      ? repository.withPolicy(policy)
      : repository) as unknown as DeviceRepository;
  };

  devices.get('/', async (context) => {
    const repository = await repositoryFor(context, 'view');
    if (!repository) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    try {
      const records = await repository.findMany();
      // The list response states the same eligibility the action endpoints
      // enforce: a collection-wide create capability and a per-row edit/delete
      // flag proved with each action's own Policy. The page only renders what
      // the server reports, and every mutation is authorized again on its own
      // path.
      const [editRepository, deleteRepository, createRepository] =
        await Promise.all([
          repositoryFor(context, 'edit'),
          repositoryFor(context, 'delete'),
          repositoryFor(context, 'create'),
        ]);
      const data = await Promise.all(
        records.map(async (record) => ({
          ...record,
          canEdit: await rowIsInScope(editRepository, record.id),
          canDelete: await rowIsInScope(deleteRepository, record.id),
        })),
      );
      return context.json({
        data,
        meta: { canCreate: createRepository !== undefined },
      });
    } catch (error) {
      return respondToRepositoryError(context, error);
    }
  });

  devices.post('/', async (context) => {
    const repository = await repositoryFor(context, 'create');
    if (!repository) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const payload = await readJson(context);
    const code = readText(payload.code, CODE_MAX_LENGTH);
    const name = readText(payload.name, NAME_MAX_LENGTH);
    if (!code || !name) {
      return context.json({ code: 'INVALID_PAYLOAD' }, 400);
    }
    try {
      const duplicate = await repository.exists({
        filter: (filter) => filter.string('code').eq(code),
      });
      if (duplicate) {
        return context.json({ code: 'DUPLICATE_CODE' }, 409);
      }
      const now = new Date();
      const result = await repository.createOne({
        values: {
          id: crypto.randomUUID(),
          code,
          name,
          createdAt: now,
          updatedAt: now,
        },
      });
      return context.json({ data: result.record }, 201);
    } catch (error) {
      return respondToRepositoryError(context, error);
    }
  });

  devices.patch('/:id', async (context) => {
    const repository = await repositoryFor(context, 'edit');
    if (!repository) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const id = context.req.param('id');
    const payload = await readJson(context);
    const values: DeviceUpdate = { updatedAt: new Date() };
    if (payload.code !== undefined) {
      const code = readText(payload.code, CODE_MAX_LENGTH);
      if (!code) {
        return context.json({ code: 'INVALID_PAYLOAD' }, 400);
      }
      values.code = code;
    }
    if (payload.name !== undefined) {
      const name = readText(payload.name, NAME_MAX_LENGTH);
      if (!name) {
        return context.json({ code: 'INVALID_PAYLOAD' }, 400);
      }
      values.name = name;
    }
    if (values.code === undefined && values.name === undefined) {
      return context.json({ code: 'INVALID_PAYLOAD' }, 400);
    }
    try {
      const result = await repository.updateOne({
        filter: (filter) => filter.string('id').eq(id),
        values,
      });
      return context.json({ data: result.record });
    } catch (error) {
      return respondToRepositoryError(context, error);
    }
  });

  devices.delete('/:id', async (context) => {
    const repository = await repositoryFor(context, 'delete');
    if (!repository) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const id = context.req.param('id');
    try {
      await repository.deleteOne({
        filter: (filter) => filter.string('id').eq(id),
      });
      return context.json({ data: { id } });
    } catch (error) {
      return respondToRepositoryError(context, error);
    }
  });

  router.route('/devices', devices);
  return router;
}

/**
 * Whether one row id falls inside the scope the action's Policy already
 * enforces. A missing repository means the action itself was denied, and a
 * refused read means the row is out of scope, so both answer `false` instead of
 * failing the list request.
 */
async function rowIsInScope(
  repository: DeviceRepository | undefined,
  id: string,
): Promise<boolean> {
  if (!repository) return false;
  try {
    return await repository.exists({
      filter: (filter) => filter.string('id').eq(id),
    });
  } catch {
    return false;
  }
}

/** A trimmed, non-empty string within the column's length, or `undefined`. */
function readText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return undefined;
  return trimmed;
}

/** Reads a JSON object body, treating anything malformed as an empty payload. */
async function readJson(context: Context): Promise<Record<string, unknown>> {
  try {
    const value = (await context.req.json()) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// Repository errors are read by their `code` rather than by class identity so
// the route does not depend on `@nocobase/repository-input`'s internal error
// export path.
const REPOSITORY_ERROR_STATUS: Readonly<Record<string, number>> = {
  RECORD_NOT_FOUND: 404,
  RECORD_OUTSIDE_SCOPE: 404,
  SCOPE_VIOLATION: 404,
  READ_FORBIDDEN: 403,
  WRITE_FORBIDDEN: 403,
  FIELD_WRITE_FORBIDDEN: 403,
};

function respondToRepositoryError(
  context: Context,
  error: unknown,
): Response | Promise<Response> {
  const code =
    error && typeof error === 'object'
      ? (error as { code?: unknown }).code
      : undefined;
  if (typeof code === 'string') {
    const status = REPOSITORY_ERROR_STATUS[code];
    if (status === 403) return context.json({ code: 'FORBIDDEN' }, 403);
    if (status === 404) return context.json({ code: 'NOT_FOUND' }, 404);
  }
  throw error;
}

const routes: readonly AppRouteContribution<Application>[] = [
  defineApiRoutes((app) => createDeviceRoutes(app)),
];

export default routes;
