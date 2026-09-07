import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type DatabaseAuthorizationConditions,
  type DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization';

import {
  assetServiceToken,
  AssetDomainError,
  type AssetService,
} from '../providers/index.js';

const ASSET_TYPES = ['computer', 'monitor', 'phone', 'other'];
const ASSET_STATUSES = ['available', 'inUse', 'maintenance', 'retired'];

const ASSET_OUTPUT_FIELDS = [
  'id',
  'assetNumber',
  'name',
  'type',
  'brandModel',
  'status',
  'currentEmployeeId',
  'purchasedAt',
  'remark',
  'createdAt',
];
const ASSET_INPUT_FIELDS = [
  'assetNumber',
  'name',
  'type',
  'brandModel',
  'status',
  'purchasedAt',
  'remark',
];
const RECORD_OUTPUT_FIELDS = [
  'id',
  'assetId',
  'employeeId',
  'claimedAt',
  'returnedAt',
  'status',
  'remark',
  'createdAt',
];
const EMPLOYEE_OUTPUT_FIELDS = ['id', 'name', 'department', 'email', 'isAdmin'];

/**
 * The subset of the authorization scope the asset routes rely on. The real
 * scope is installed per-request by `authorization.middleware()`; tests inject
 * a fake scope the same way.
 */
export interface AssetAuthorizationScope {
  authorize(request: {
    resource: { type: string; id: string };
    action: string;
    params: DatabaseAuthorizationParams;
  }): Promise<{
    effect: 'permit' | 'conditional' | 'deny';
    conditions?: DatabaseAuthorizationConditions;
  }>;
}

export type AssetRouterEnv = {
  Variables: {
    authz: AssetAuthorizationScope;
  };
};

class ForbiddenError extends Error {
  constructor() {
    super('Forbidden');
    this.name = 'ForbiddenError';
  }
}

async function authorizeDatabase(
  authz: AssetAuthorizationScope,
  resource: string,
  action: string,
  params: DatabaseAuthorizationParams = {},
): Promise<DatabaseAuthorizationConditions> {
  const decision = await authz.authorize({
    resource: { type: 'database.collection', id: resource },
    action,
    params,
  });
  if (decision.effect === 'deny') {
    throw new ForbiddenError();
  }
  return decision.conditions as DatabaseAuthorizationConditions;
}

function badRequest(message: string): Response {
  return Response.json({ code: 'BAD_REQUEST', message }, { status: 400 });
}

function notFound(message: string): Response {
  return Response.json({ code: 'NOT_FOUND', message }, { status: 404 });
}

function conflict(message: string): Response {
  return Response.json({ code: 'CONFLICT', message }, { status: 409 });
}

function forbidden(): Response {
  return Response.json(
    {
      code: 'FORBIDDEN',
      message: 'You are not allowed to perform this action.',
    },
    { status: 403 },
  );
}

function mapError(error: unknown): Response {
  if (error instanceof ForbiddenError) {
    return forbidden();
  }
  if (error instanceof AssetDomainError) {
    if (error.code === 'ASSET_NOT_FOUND') {
      return notFound(error.message);
    }
    return conflict(error.message);
  }
  throw error;
}

export interface AssetRouterDependencies {
  assets: AssetService;
  /** Fully-qualified authorization resource ids, e.g. `main.itAssets`. */
  resources: {
    assets: string;
    records: string;
    employees: string;
  };
}

export function createAssetRouter(
  dependencies: AssetRouterDependencies,
): Hono<AssetRouterEnv> {
  const { assets, resources } = dependencies;
  const router = new Hono<AssetRouterEnv>();

  // -- Employees (static paths must precede /assets/:id) ---------------------

  router.get('/assets/employees', async (context) => {
    try {
      const conditions = await authorizeDatabase(
        context.var.authz,
        resources.employees,
        'read',
        {
          fields: { output: EMPLOYEE_OUTPUT_FIELDS },
        },
      );
      const data = await assets.listEmployees(conditions.filter);
      return context.json({ data });
    } catch (error) {
      return mapError(error);
    }
  });

  // -- Records ---------------------------------------------------------------

  router.get('/assets/records', async (context) => {
    try {
      const conditions = await authorizeDatabase(
        context.var.authz,
        resources.records,
        'read',
        {
          fields: { output: RECORD_OUTPUT_FIELDS },
        },
      );
      const filters = {
        status: context.req.query('status') || undefined,
        search: context.req.query('search') || undefined,
        assetId: context.req.query('assetId') || undefined,
      };
      const data = await assets.listRecords(filters, conditions.filter);
      return context.json({ data });
    } catch (error) {
      return mapError(error);
    }
  });

  // -- Assets ----------------------------------------------------------------

  router.get('/assets', async (context) => {
    try {
      const conditions = await authorizeDatabase(
        context.var.authz,
        resources.assets,
        'read',
        {
          fields: { output: ASSET_OUTPUT_FIELDS },
        },
      );
      const filters = {
        type: context.req.query('type') || undefined,
        status: context.req.query('status') || undefined,
        search: context.req.query('search') || undefined,
      };
      const data = await assets.listAssets(filters, conditions.filter);
      return context.json({ data });
    } catch (error) {
      return mapError(error);
    }
  });

  router.post('/assets', async (context) => {
    try {
      await authorizeDatabase(context.var.authz, resources.assets, 'create', {
        fields: { input: ASSET_INPUT_FIELDS },
      });
      const body = await context.req.json<Record<string, unknown>>();
      const assetNumber =
        typeof body.assetNumber === 'string' ? body.assetNumber.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const type = typeof body.type === 'string' ? body.type : '';
      const brandModel =
        typeof body.brandModel === 'string' ? body.brandModel.trim() : '';
      const status = typeof body.status === 'string' ? body.status : '';
      if (!assetNumber || !name || !brandModel) {
        return badRequest('assetNumber, name and brandModel are required.');
      }
      if (!ASSET_TYPES.includes(type)) {
        return badRequest(`type must be one of: ${ASSET_TYPES.join(', ')}.`);
      }
      if (!ASSET_STATUSES.includes(status)) {
        return badRequest(
          `status must be one of: ${ASSET_STATUSES.join(', ')}.`,
        );
      }
      const data = await assets.createAsset({
        assetNumber,
        name,
        type,
        brandModel,
        status,
        purchasedAt:
          typeof body.purchasedAt === 'string' ? body.purchasedAt : null,
        remark: typeof body.remark === 'string' ? body.remark : null,
      });
      return context.json({ data }, 201);
    } catch (error) {
      return mapError(error);
    }
  });

  router.get('/assets/:id', async (context) => {
    try {
      const conditions = await authorizeDatabase(
        context.var.authz,
        resources.assets,
        'read',
        {
          fields: { output: ASSET_OUTPUT_FIELDS },
        },
      );
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return badRequest('Invalid asset id.');
      }
      const data = await assets.getAsset(id, conditions.filter);
      if (!data) {
        return notFound('Asset not found.');
      }
      return context.json({ data });
    } catch (error) {
      return mapError(error);
    }
  });

  router.put('/assets/:id', async (context) => {
    try {
      const conditions = await authorizeDatabase(
        context.var.authz,
        resources.assets,
        'update',
        {
          fields: { input: ASSET_INPUT_FIELDS },
        },
      );
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return badRequest('Invalid asset id.');
      }
      const body = await context.req.json<Record<string, unknown>>();
      const input: Record<string, unknown> = {};
      for (const field of ASSET_INPUT_FIELDS) {
        if (body[field] !== undefined) {
          input[field] = body[field];
        }
      }
      if (
        input.type !== undefined &&
        (typeof input.type !== 'string' || !ASSET_TYPES.includes(input.type))
      ) {
        return badRequest(`type must be one of: ${ASSET_TYPES.join(', ')}.`);
      }
      if (
        input.status !== undefined &&
        (typeof input.status !== 'string' ||
          !ASSET_STATUSES.includes(input.status))
      ) {
        return badRequest(
          `status must be one of: ${ASSET_STATUSES.join(', ')}.`,
        );
      }
      const data = await assets.updateAsset(id, input, conditions.filter);
      if (!data) {
        return notFound('Asset not found.');
      }
      return context.json({ data });
    } catch (error) {
      return mapError(error);
    }
  });

  router.delete('/assets/:id', async (context) => {
    try {
      const conditions = await authorizeDatabase(
        context.var.authz,
        resources.assets,
        'delete',
      );
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return badRequest('Invalid asset id.');
      }
      const deleted = await assets.deleteAsset(id, conditions.filter);
      if (!deleted) {
        return notFound('Asset not found.');
      }
      return context.json({ data: { id } });
    } catch (error) {
      return mapError(error);
    }
  });

  router.post('/assets/:id/claim', async (context) => {
    try {
      const conditions = await authorizeDatabase(
        context.var.authz,
        resources.assets,
        'claim',
      );
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return badRequest('Invalid asset id.');
      }
      const body = await context.req.json<Record<string, unknown>>();
      const employeeId = Number(body.employeeId);
      if (!Number.isInteger(employeeId) || employeeId <= 0) {
        return badRequest('employeeId is required.');
      }
      const remark = typeof body.remark === 'string' ? body.remark : null;
      const data = await assets.claimAsset(
        id,
        employeeId,
        remark,
        conditions.filter,
      );
      return context.json({ data });
    } catch (error) {
      return mapError(error);
    }
  });

  router.post('/assets/:id/return', async (context) => {
    try {
      const conditions = await authorizeDatabase(
        context.var.authz,
        resources.assets,
        'return',
      );
      const id = Number(context.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return badRequest('Invalid asset id.');
      }
      const body = await context.req.json<Record<string, unknown>>();
      const remark = typeof body.remark === 'string' ? body.remark : null;
      const data = await assets.returnAsset(id, remark, conditions.filter);
      return context.json({ data });
    } catch (error) {
      return mapError(error);
    }
  });

  return router;
}

export function createAssetApiRouter(app: Application): Hono {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const assets = app.container.resolve(assetServiceToken);

  const resources = {
    assets: authz.database.collections.resolveName('itAssets'),
    records: authz.database.collections.resolveName('itAssetRecords'),
    employees: authz.database.collections.resolveName('itEmployees'),
  };

  const router = new Hono();
  // Hono's `use('/assets')` matches only the exact path, not sub-paths, so
  // scope the middleware to `/assets/*` to cover every handler in the router.
  router.use('/assets/*', auth.required(), authz.middleware());
  router.route('/', createAssetRouter({ assets, resources }));
  return router;
}

export const assetApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => createAssetApiRouter(app));
