import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthSession,
} from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';

import { materialServiceToken } from '../providers/materials.js';
import { MaterialError } from '../providers/materials-service.js';
import {
  CreateMaterialInput,
  CreateShareInput,
  ListMaterialsQuery,
  MaterialDetailSchema,
  MaterialListItemSchema,
  MaterialListMeta,
  MaterialParams,
  MaterialShareSchema,
  ShareParams,
  UpdateMaterialInput,
} from './schemas.js';

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthSession;
  }
}

const tags = ['Materials'];

/**
 * A domain error carries only a reason; the route decides its HTTP status so
 * the service stays free of HTTP concerns.
 */
function toMaterialsApiError(error: unknown): ApiError | undefined {
  if (!(error instanceof MaterialError)) return undefined;
  const status =
    error.reason === 'MATERIAL_FORBIDDEN'
      ? 'PERMISSION_DENIED'
      : error.reason === 'MATERIAL_NOT_FOUND' ||
          error.reason === 'SHARE_NOT_FOUND' ||
          error.reason === 'SHARE_TARGET_NOT_FOUND'
        ? 'NOT_FOUND'
        : 'INVALID_ARGUMENT';
  return new ApiError({
    status,
    reason: error.reason,
    domain: 'materials',
    message: error.message,
    cause: error,
  });
}

function currentUserId(context: { get: (key: 'auth') => AuthSession }): string {
  const session = context.get('auth');
  if (!session) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTHENTICATION_REQUIRED',
      domain: 'authentication',
      message: 'Authentication required.',
    });
  }
  return session.user.id;
}

export const apiRoutes = defineApiRoutes<Application>(({ container }) => {
  const router = new Hono();
  const routes = new Hono();
  const authentication = container.resolve(authenticationToken);
  const materials = container.resolve(materialServiceToken);

  routes.onError((error, context) =>
    apiErrorHandler(toMaterialsApiError(error) ?? error, context),
  );
  routes.use('*', authentication.required());

  routes.get(
    '/',
    describeRoute({
      tags,
      summary: 'List materials',
      operationId: 'materialsListMaterials',
      description:
        'Only the documents the current user may read are returned: their own, published non-confidential documents when they hold a reading role, and single documents opened to them temporarily.',
      responses: {
        200: listResponse(MaterialListItemSchema, MaterialListMeta),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', ListMaterialsQuery),
    async (context) => {
      const userId = currentUserId(context);
      const { q } = context.req.valid('query');
      const { items, canCreate } = await materials.list(userId);
      const filtered =
        q && q.trim().length > 0
          ? (() => {
              const needle = q.trim().toLowerCase();
              return items.filter(
                (item) =>
                  item.title.toLowerCase().includes(needle) ||
                  item.content.toLowerCase().includes(needle),
              );
            })()
          : items;
      return context.json({
        data: filtered,
        meta: { total: filtered.length, canCreate },
      });
    },
  );

  routes.post(
    '/',
    describeRoute({
      tags,
      summary: 'Create a material',
      operationId: 'materialsCreateMaterial',
      description:
        'A curator creates a document they own. A reader may not create documents.',
      responses: {
        201: dataResponse(MaterialDetailSchema, 'The created material.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', CreateMaterialInput),
    async (context) => {
      const userId = currentUserId(context);
      const material = await materials.create(
        userId,
        context.req.valid('json'),
      );
      return context.json({ data: material }, 201);
    },
  );

  routes.get(
    '/:materialId/shares',
    describeRoute({
      tags,
      summary: 'List who a material is open to',
      operationId: 'materialsListShares',
      description: 'Administrators only.',
      responses: {
        200: listResponse(MaterialShareSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'The material does not exist.'),
      },
    }),
    apiValidator('param', MaterialParams),
    async (context) => {
      const userId = currentUserId(context);
      const { materialId } = context.req.valid('param');
      const shares = await materials.listShares(userId, materialId);
      return context.json({ data: shares });
    },
  );

  routes.post(
    '/:materialId/shares',
    describeRoute({
      tags,
      summary: 'Open a material to one user',
      operationId: 'materialsCreateShare',
      description:
        'Administrators only. Opens this single document; it does not change what the user may do with any other document, and it never exposes a confidential document.',
      responses: {
        201: dataResponse(MaterialShareSchema, 'The created share.'),
        ...apiErrorResponses,
        404: apiErrorResponse(
          404,
          'The material or the selected user does not exist.',
        ),
      },
    }),
    apiValidator('param', MaterialParams),
    apiValidator('json', CreateShareInput),
    async (context) => {
      const userId = currentUserId(context);
      const { materialId } = context.req.valid('param');
      const { userId: targetUserId } = context.req.valid('json');
      const share = await materials.addShare(userId, materialId, targetUserId);
      return context.json({ data: share }, 201);
    },
  );

  routes.delete(
    '/:materialId/shares/:userId',
    describeRoute({
      tags,
      summary: 'Revoke a temporary share',
      operationId: 'materialsDeleteShare',
      description: 'Administrators only.',
      responses: {
        204: emptyResponse('The share was revoked.'),
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'The share does not exist.'),
      },
    }),
    apiValidator('param', ShareParams),
    async (context) => {
      const userId = currentUserId(context);
      const { materialId, userId: targetUserId } = context.req.valid('param');
      await materials.removeShare(userId, materialId, targetUserId);
      return context.body(null, 204);
    },
  );

  routes.get(
    '/:materialId',
    describeRoute({
      tags,
      summary: 'Get one material',
      operationId: 'materialsGetMaterial',
      description:
        'A document the current user may not read answers 404, so an unshared draft does not reveal that it exists.',
      responses: {
        200: dataResponse(MaterialDetailSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(
          404,
          'The material does not exist or is not readable.',
        ),
      },
    }),
    apiValidator('param', MaterialParams),
    async (context) => {
      const userId = currentUserId(context);
      const { materialId } = context.req.valid('param');
      return context.json({ data: await materials.get(userId, materialId) });
    },
  );

  routes.patch(
    '/:materialId',
    describeRoute({
      tags,
      summary: 'Update a material',
      operationId: 'materialsUpdateMaterial',
      description: 'The owner, or an administrator. A reader may never edit.',
      responses: {
        200: dataResponse(MaterialDetailSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'The material does not exist.'),
      },
    }),
    apiValidator('param', MaterialParams),
    apiValidator('json', UpdateMaterialInput),
    async (context) => {
      const userId = currentUserId(context);
      const { materialId } = context.req.valid('param');
      const material = await materials.update(
        userId,
        materialId,
        context.req.valid('json'),
      );
      return context.json({ data: material });
    },
  );

  routes.delete(
    '/:materialId',
    describeRoute({
      tags,
      summary: 'Delete a material',
      operationId: 'materialsDeleteMaterial',
      description: 'The owner, or an administrator.',
      responses: {
        204: emptyResponse('The material was deleted.'),
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'The material does not exist.'),
      },
    }),
    apiValidator('param', MaterialParams),
    async (context) => {
      const userId = currentUserId(context);
      const { materialId } = context.req.valid('param');
      await materials.remove(userId, materialId);
      return context.body(null, 204);
    },
  );

  router.route('/materials', routes);
  return router;
});
