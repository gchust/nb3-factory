import type { AuthorizationEnv } from '@nocobase/authorization/core';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  appErrorDomain,
  dataResponse,
  describeRoute,
  emptyResponse,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

import { SHARING_SETTINGS_ID } from '../materials/constants.js';
import { materialsServiceToken } from '../providers/materials/index.js';
import {
  ListMaterialsQuery,
  MaterialCreateInput,
  MaterialIdParams,
  MaterialSchema,
  MaterialShareInput,
  MaterialShareParams,
  MaterialShareSchema,
  MaterialSharesMetaSchema,
  MaterialUpdateInput,
  MaterialsListMetaSchema,
} from './schemas.js';

const tags = ['Materials'];

/**
 * The administrator's sharing permission, checked before a material's existence is revealed. Only the holder may open
 * or revoke a temporary hand-over, which is the whole point of the feature: a reader cannot open a draft themselves.
 */
const requireSharing = createMiddleware<AuthorizationEnv>(
  async (context, next) => {
    await context.get('authz').require({
      resource: { type: 'settings', id: SHARING_SETTINGS_ID },
      action: 'manage',
    });
    await next();
  },
);

function notFound(): never {
  throw new ApiError({
    status: 'NOT_FOUND',
    reason: 'MATERIAL_NOT_FOUND',
    domain: appErrorDomain,
    message: 'The material does not exist or is not visible to you.',
  });
}

/**
 * The materials HTTP surface.
 *
 * Every route authenticates, then lets the authorization middleware put the request's identity on the context. The
 * service turns that identity into a Repository Policy, so a route never decides who may do what: a write the policy
 * refuses answers `403`, and a row the policy does not select is simply not found.
 */
export function createMaterialsRouter(app: Application): Hono {
  const authentication = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const materials = app.container.resolve(materialsServiceToken);

  const router = new Hono();
  const api = new Hono<AuthorizationEnv>();

  api.onError(apiErrorHandler);
  api.use('*', authentication.required(), authorization.middleware());

  api.get(
    '/',
    describeRoute({
      tags,
      summary: 'List the materials visible to the caller',
      operationId: 'materialsListMaterials',
      responses: {
        200: listResponse(MaterialSchema, MaterialsListMetaSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', ListMaterialsQuery),
    async (context) => {
      const query = context.req.valid('query');
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const result = await materials.list(context.get('authz'), {
        ...query,
        page,
        pageSize,
      });
      return context.json({
        data: result.records,
        meta: {
          page,
          pageSize,
          total: result.total,
          capabilities: result.capabilities,
        },
      });
    },
  );

  api.post(
    '/',
    describeRoute({
      tags,
      summary: 'Create a material owned by the caller',
      operationId: 'materialsCreateMaterial',
      responses: {
        201: dataResponse(MaterialSchema, 'The created material.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', MaterialCreateInput),
    async (context) => {
      const authz = context.get('authz');
      const record = await materials.create(
        authz,
        authz.identity.principal.id,
        context.req.valid('json'),
      );
      return context.json({ data: record }, 201);
    },
  );

  api.get(
    '/:materialId',
    describeRoute({
      tags,
      summary: 'Read one material',
      operationId: 'materialsGetMaterial',
      responses: {
        200: dataResponse(MaterialSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', MaterialIdParams),
    async (context) => {
      const record = await materials.get(
        context.get('authz'),
        context.req.valid('param').materialId,
      );
      if (!record) {
        notFound();
      }
      return context.json({ data: record });
    },
  );

  api.patch(
    '/:materialId',
    describeRoute({
      tags,
      summary: 'Update a material the caller maintains',
      operationId: 'materialsUpdateMaterial',
      responses: {
        200: dataResponse(MaterialSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', MaterialIdParams),
    apiValidator('json', MaterialUpdateInput),
    async (context) => {
      const record = await materials.update(
        context.get('authz'),
        context.req.valid('param').materialId,
        context.req.valid('json'),
      );
      if (!record) {
        notFound();
      }
      return context.json({ data: record });
    },
  );

  api.delete(
    '/:materialId',
    describeRoute({
      tags,
      summary: 'Delete a material the caller maintains',
      operationId: 'materialsDeleteMaterial',
      responses: {
        204: emptyResponse('The material was deleted.'),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
    }),
    apiValidator('param', MaterialIdParams),
    async (context) => {
      await materials.remove(
        context.get('authz'),
        context.req.valid('param').materialId,
      );
      return context.body(null, 204);
    },
  );

  // --- Temporary sharing, administrator only -------------------------------------------------------------------------

  api.get(
    '/:materialId/shares',
    describeRoute({
      tags,
      summary: 'List the readers one material is temporarily shared with',
      operationId: 'materialsListShares',
      responses: {
        200: listResponse(MaterialShareSchema, MaterialSharesMetaSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
    }),
    requireSharing,
    apiValidator('param', MaterialIdParams),
    async (context) => {
      const { materialId } = context.req.valid('param');
      if (!(await materials.findMaterial(materialId))) {
        notFound();
      }
      const data = await materials.listShares(materialId);
      return context.json({ data, meta: { total: data.length } });
    },
  );

  api.post(
    '/:materialId/shares',
    describeRoute({
      tags,
      summary: 'Open one material to one reader',
      operationId: 'materialsCreateShare',
      responses: {
        201: dataResponse(
          MaterialShareSchema,
          'The reader the material is now shared with.',
        ),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
    }),
    requireSharing,
    apiValidator('param', MaterialIdParams),
    apiValidator('json', MaterialShareInput),
    async (context) => {
      const { materialId } = context.req.valid('param');
      if (!(await materials.findMaterial(materialId))) {
        notFound();
      }
      const share = await materials.addShare(
        materialId,
        context.req.valid('json').userId,
      );
      return context.json({ data: share }, 201);
    },
  );

  api.delete(
    '/:materialId/shares/:userId',
    describeRoute({
      tags,
      summary: 'Revoke a reader’s temporary access to one material',
      operationId: 'materialsDeleteShare',
      responses: {
        204: emptyResponse('The temporary access was revoked.'),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
    }),
    requireSharing,
    apiValidator('param', MaterialShareParams),
    async (context) => {
      const { materialId, userId } = context.req.valid('param');
      const removed = await materials.removeShare(materialId, userId);
      if (!removed) {
        notFound();
      }
      return context.body(null, 204);
    },
  );

  router.route('/materials', api);
  return router;
}
