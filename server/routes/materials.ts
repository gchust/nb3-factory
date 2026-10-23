import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationContext,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';

import { MATERIALS_SHARING_SETTINGS } from '../materials/authorization.js';
import {
  materialsServiceToken,
  type MaterialShare,
  type MaterialsCapabilities,
  type MaterialView,
  type ShareTarget,
} from '../providers/materials-service.js';

const TAGS = ['Materials'];
const DOMAIN = 'materials';

/** One material as the API answers it. */
const MaterialSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    ownerId: z.string(),
    ownerName: z.string().nullable(),
    published: z.boolean(),
    confidential: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'Material' }) satisfies z.ZodType<MaterialView>;

const CapabilitiesSchema = z
  .object({
    create: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
    share: z.boolean(),
  })
  .meta({
    ref: 'MaterialsCapabilities',
  }) satisfies z.ZodType<MaterialsCapabilities>;

const ShareSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    email: z.string(),
  })
  .meta({ ref: 'MaterialShare' }) satisfies z.ZodType<MaterialShare>;

const ShareTargetSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    email: z.string(),
  })
  .meta({ ref: 'MaterialShareTarget' }) satisfies z.ZodType<ShareTarget>;

const MaterialParams = z.object({ materialId: z.string().min(1) });
const ShareParams = MaterialParams.extend({ userId: z.string().min(1) });

const CreateMaterialBody = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().nullable().default(null),
  published: z.boolean().default(false),
  confidential: z.boolean().default(false),
});

const UpdateMaterialBody = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    body: z.string().nullable().optional(),
    published: z.boolean().optional(),
    confidential: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

const ShareBody = z.object({ userId: z.string().min(1) });

const notAllowed = (action: string): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'MATERIAL_SHARING_DENIED',
    domain: DOMAIN,
    message: `This account may not ${action} material shares.`,
  });

export const materialsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const materials = app.container.resolve(materialsServiceToken);

    routes.use('*', auth.required(), authorization.middleware());

    /** Administrative share operations are gated by the rule plugin's settings item. */
    const requireSharing = async (
      authz: AuthorizationContext,
      action: 'read' | 'create' | 'delete',
    ) => {
      const allowed = await authz.can({
        resource: { type: 'settings', id: MATERIALS_SHARING_SETTINGS },
        action,
      });
      if (!allowed) throw notAllowed(action);
    };

    routes.get(
      '/capabilities',
      describeRoute({
        tags: TAGS,
        summary: 'Read what the signed-in person may do',
        operationId: 'materialsCapabilities',
        responses: {
          200: dataResponse(CapabilitiesSchema),
          ...apiErrorResponses,
        },
      }),
      async (c) =>
        c.json({ data: await materials.capabilities(c.get('authz')) }),
    );

    routes.get(
      '/',
      describeRoute({
        tags: TAGS,
        summary: 'List the materials this account may read',
        operationId: 'listMaterials',
        responses: {
          200: listResponse(
            MaterialSchema,
            undefined,
            'Every material the account may read.',
          ),
          ...apiErrorResponses,
        },
      }),
      async (c) => {
        const data = await materials.list(c.get('authz'));
        return c.json({ data, meta: { total: data.length } });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags: TAGS,
        summary: 'Create a material',
        operationId: 'createMaterial',
        responses: {
          201: dataResponse(MaterialSchema, 'The created material.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateMaterialBody),
      async (c) => {
        const input = c.req.valid('json');
        const data = await materials.create(c.get('authz'), {
          title: input.title,
          body: input.body,
          published: input.published,
          confidential: input.confidential,
        });
        return c.json({ data }, 201);
      },
    );

    routes.get(
      '/:materialId',
      describeRoute({
        tags: TAGS,
        summary: 'Read one material',
        operationId: 'getMaterial',
        responses: {
          200: dataResponse(MaterialSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', MaterialParams),
      async (c) =>
        c.json({
          data: await materials.get(
            c.get('authz'),
            c.req.valid('param').materialId,
          ),
        }),
    );

    routes.patch(
      '/:materialId',
      describeRoute({
        tags: TAGS,
        summary: 'Update one material',
        operationId: 'updateMaterial',
        responses: {
          200: dataResponse(MaterialSchema, 'The updated material.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', MaterialParams),
      apiValidator('json', UpdateMaterialBody),
      async (c) =>
        c.json({
          data: await materials.update(
            c.get('authz'),
            c.req.valid('param').materialId,
            c.req.valid('json'),
          ),
        }),
    );

    routes.delete(
      '/:materialId',
      describeRoute({
        tags: TAGS,
        summary: 'Delete one material',
        operationId: 'deleteMaterial',
        responses: {
          204: emptyResponse('The material was deleted.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', MaterialParams),
      async (c) => {
        await materials.remove(c.get('authz'), c.req.valid('param').materialId);
        return c.body(null, 204);
      },
    );

    routes.get(
      '/:materialId/shares',
      describeRoute({
        tags: TAGS,
        summary: 'List the readers one material is open to',
        operationId: 'listMaterialShares',
        responses: {
          200: listResponse(
            ShareSchema,
            undefined,
            'The readers the material is open to.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', MaterialParams),
      async (c) => {
        await requireSharing(c.get('authz'), 'read');
        const data = await materials.listShares(
          c.req.valid('param').materialId,
        );
        return c.json({ data, meta: { total: data.length } });
      },
    );

    routes.get(
      '/:materialId/shareTargets',
      describeRoute({
        tags: TAGS,
        summary: 'List readers a material can still be opened to',
        operationId: 'listMaterialShareTargets',
        responses: {
          200: listResponse(
            ShareTargetSchema,
            undefined,
            'Enabled accounts not yet given access.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', MaterialParams),
      async (c) => {
        await requireSharing(c.get('authz'), 'read');
        const data = await materials.shareTargets(
          c.req.valid('param').materialId,
        );
        return c.json({ data, meta: { total: data.length } });
      },
    );

    routes.post(
      '/:materialId/shares',
      describeRoute({
        tags: TAGS,
        summary: 'Open one material to one reader',
        operationId: 'createMaterialShare',
        responses: {
          201: dataResponse(
            ShareSchema,
            'The reader the material is now open to.',
          ),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', MaterialParams),
      apiValidator('json', ShareBody),
      async (c) => {
        await requireSharing(c.get('authz'), 'create');
        const data = await materials.share(
          c.get('authz'),
          c.req.valid('param').materialId,
          c.req.valid('json').userId,
        );
        return c.json({ data }, 201);
      },
    );

    routes.delete(
      '/:materialId/shares/:userId',
      describeRoute({
        tags: TAGS,
        summary: 'Close one material to one reader',
        operationId: 'deleteMaterialShare',
        responses: {
          204: emptyResponse('The material is no longer open to the reader.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ShareParams),
      async (c) => {
        await requireSharing(c.get('authz'), 'delete');
        await materials.revokeShare(
          c.get('authz'),
          c.req.valid('param').materialId,
          c.req.valid('param').userId,
        );
        return c.body(null, 204);
      },
    );

    router.route('/materials', routes);
    return router;
  });
