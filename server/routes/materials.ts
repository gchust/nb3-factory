import type { Auth } from '@nocobase/app-plugin-authentication';
import { type AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
  emptyResponse,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { type MaterialsService } from '../services/materials.js';
import {
  ListMaterialsQuery,
  MaterialContentInput,
  MaterialIdParams,
  MaterialSchema,
} from './schemas.js';

const MATERIALS_TAG = 'Materials';

function materialNotFound(id: number): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'MATERIAL_NOT_FOUND',
    domain: 'materials',
    message: `Material ${id} was not found.`,
  });
}

/**
 * `/materials`: the records the assistant answers from.
 *
 * Every route installs its own authentication and authorization, so nothing here depends on where it is mounted. The
 * service applies the caller's own Policy, which is why a colleague gets the materials they may read and nothing else —
 * the same filtering the assistant tool goes through.
 */
export function createMaterialsRoutes(
  auth: Auth,
  authorization: AppAuthorization,
  materials: MaterialsService,
) {
  const routes = new Hono()
    .use('*', auth.required())
    .use('*', authorization.middleware());

  routes.get(
    '/',
    describeRoute({
      tags: [MATERIALS_TAG],
      summary: 'List the materials the caller may read',
      operationId: 'listMaterials',
      description:
        'Materials the caller is authorized to read, newest first. A colleague sees only the unrestricted ones; a supervisor sees every material.',
      responses: {
        200: listResponse(MaterialSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', ListMaterialsQuery),
    async (context) => {
      const query = context.req.valid('query');
      const result = await materials.list(context.get('authz'), {
        limit: query.limit,
        offset: query.offset,
      });
      return context.json({ data: result.data, meta: { total: result.total } });
    },
  );

  routes.post(
    '/',
    describeRoute({
      tags: [MATERIALS_TAG],
      summary: 'Create a material',
      operationId: 'createMaterial',
      description:
        'Adds a material. Requires permission to maintain materials; a colleague is refused.',
      responses: {
        201: dataResponse(MaterialSchema, 'The material was created.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', MaterialContentInput),
    async (context) => {
      const input = context.req.valid('json');
      const material = await materials.create(context.get('authz'), input);
      return context.json({ data: material }, 201);
    },
  );

  routes.get(
    '/:materialId',
    describeRoute({
      tags: [MATERIALS_TAG],
      summary: 'Get one material',
      operationId: 'getMaterial',
      description:
        'One material by id. A material the caller may not read answers 404, exactly as an unknown id does.',
      responses: {
        200: dataResponse(MaterialSchema),
        404: apiErrorResponse(404),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', MaterialIdParams),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const material = await materials.get(context.get('authz'), materialId);
      if (!material) {
        throw materialNotFound(materialId);
      }
      return context.json({ data: material });
    },
  );

  routes.patch(
    '/:materialId',
    describeRoute({
      tags: [MATERIALS_TAG],
      summary: 'Update a material',
      operationId: 'updateMaterial',
      description:
        'Replaces a material title and body. Requires permission to maintain materials.',
      responses: {
        200: dataResponse(MaterialSchema, 'The material was updated.'),
        404: apiErrorResponse(404),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', MaterialIdParams),
    apiValidator('json', MaterialContentInput),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const input = context.req.valid('json');
      const material = await materials.update(
        context.get('authz'),
        materialId,
        input,
      );
      if (!material) {
        throw materialNotFound(materialId);
      }
      return context.json({ data: material });
    },
  );

  routes.delete(
    '/:materialId',
    describeRoute({
      tags: [MATERIALS_TAG],
      summary: 'Delete a material',
      operationId: 'deleteMaterial',
      description:
        'Removes a material. Requires permission to maintain materials.',
      responses: {
        204: emptyResponse('The material was deleted.'),
        404: apiErrorResponse(404),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', MaterialIdParams),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const removed = await materials.remove(context.get('authz'), materialId);
      if (!removed) {
        throw materialNotFound(materialId);
      }
      return context.body(null, 204);
    },
  );

  return routes;
}
