import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { currentUserId } from './current-user.js';
import {
  projectMaterialsServiceToken,
  ProjectMaterialError,
  type ProjectMaterialsService,
} from '../providers/project-materials.js';
import {
  CreateProjectMaterialInput,
  ListProjectMaterialsQuery,
  ProjectMaterialParams,
  ProjectMaterialSchema,
  UpdateProjectMaterialInput,
} from './schemas.js';

/** The domain of every reason this application defines for project materials. */
const DOMAIN = 'projectMaterials';

const TAGS = ['ProjectMaterials'];

function materialNotFound(materialId: number): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'MATERIAL_NOT_FOUND',
    domain: DOMAIN,
    message: `Material ${materialId} was not found.`,
  });
}

function toProjectMaterialApiError(error: ProjectMaterialError): ApiError {
  return new ApiError({
    status: 'INVALID_ARGUMENT',
    reason: error.code,
    domain: DOMAIN,
    message: error.message,
    fieldViolations: [{ field: error.field, description: error.message }],
  });
}

/**
 * Runs a service write, translating a validation refusal into the standard API
 * error.
 *
 * The translation happens here rather than in `router.onError`, because the
 * application mounts every contribution with `api.route('/', router)`, which
 * merges routes into one router and drops a mounted router's own `onError`.
 * Converting before the error escapes keeps the refusal a `400`.
 */
async function runWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProjectMaterialError) {
      throw toProjectMaterialApiError(error);
    }
    throw error;
  }
}

export function createProjectMaterialsRouter(app: Application): Hono {
  const auth = app.container.resolve(authenticationToken);
  const service = app.container.resolve<ProjectMaterialsService>(
    projectMaterialsServiceToken,
  );
  const router = new Hono();

  router.get(
    '/projectMaterials',
    auth.required(),
    describeRoute({
      tags: TAGS,
      summary: 'List project materials',
      operationId: 'listProjectMaterials',
      description:
        'Lists the signed-in user’s own materials, most recently updated first, each with its attachments. Another user’s materials are never included.',
      responses: {
        '200': listResponse(
          ProjectMaterialSchema,
          undefined,
          'One page of materials.',
        ),
        '401': apiErrorResponse(401),
        '500': apiErrorResponse(500),
      },
    }),
    apiValidator('query', ListProjectMaterialsQuery),
    async (context) => {
      const { page = 1, pageSize = 20 } = context.req.valid('query');
      const { items, total } = await service.list(currentUserId(context), {
        page,
        pageSize,
      });
      return context.json({ data: items, meta: { page, pageSize, total } });
    },
  );

  router.get(
    '/projectMaterials/:materialId',
    auth.required(),
    describeRoute({
      tags: TAGS,
      summary: 'Get a project material',
      operationId: 'getProjectMaterial',
      description:
        'Returns one of the signed-in user’s materials with its attachments. Another user’s material answers `404`, so its existence is not revealed.',
      responses: {
        '200': dataResponse(ProjectMaterialSchema, 'The material.'),
        '401': apiErrorResponse(401),
        '404': apiErrorResponse(
          404,
          'The material does not exist or belongs to another user (`MATERIAL_NOT_FOUND`).',
        ),
        '500': apiErrorResponse(500),
      },
    }),
    apiValidator('param', ProjectMaterialParams),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const material = await service.get(currentUserId(context), materialId);
      if (!material) throw materialNotFound(materialId);
      return context.json({ data: material });
    },
  );

  router.post(
    '/projectMaterials',
    auth.required(),
    describeRoute({
      tags: TAGS,
      summary: 'Create a project material',
      operationId: 'createProjectMaterial',
      description:
        'Creates a material owned by the signed-in user. `fileIds` attach files that were already uploaded through `POST /api/projectMaterialFiles/uploadOne`; each must have been uploaded by the same user.',
      responses: {
        '201': dataResponse(ProjectMaterialSchema, 'The created material.'),
        '400': apiErrorResponse(
          400,
          'A file id is unknown, belongs to another user, or is already attached to another material (`INVALID_FILE_IDS`).',
        ),
        '401': apiErrorResponse(401),
        '500': apiErrorResponse(500),
      },
    }),
    apiValidator('json', CreateProjectMaterialInput),
    async (context) => {
      const material = await runWrite(() =>
        service.create(currentUserId(context), context.req.valid('json')),
      );
      return context.json({ data: material }, 201);
    },
  );

  router.patch(
    '/projectMaterials/:materialId',
    auth.required(),
    describeRoute({
      tags: TAGS,
      summary: 'Update a project material',
      operationId: 'updateProjectMaterial',
      description:
        'Updates the signed-in user’s material. `fileIds` is the complete set of attachments: a file left out is detached, never deleted, and can be attached again later.',
      responses: {
        '200': dataResponse(ProjectMaterialSchema, 'The updated material.'),
        '400': apiErrorResponse(
          400,
          'A file id is unknown, belongs to another user, or is already attached to another material (`INVALID_FILE_IDS`).',
        ),
        '401': apiErrorResponse(401),
        '404': apiErrorResponse(
          404,
          'The material does not exist or belongs to another user (`MATERIAL_NOT_FOUND`).',
        ),
        '500': apiErrorResponse(500),
      },
    }),
    apiValidator('param', ProjectMaterialParams),
    apiValidator('json', UpdateProjectMaterialInput),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const material = await runWrite(() =>
        service.update(
          currentUserId(context),
          materialId,
          context.req.valid('json'),
        ),
      );
      if (!material) throw materialNotFound(materialId);
      return context.json({ data: material });
    },
  );

  router.delete(
    '/projectMaterials/:materialId',
    auth.required(),
    describeRoute({
      tags: TAGS,
      summary: 'Delete a project material',
      operationId: 'deleteProjectMaterial',
      description:
        'Deletes the signed-in user’s material and detaches its attachments. The files themselves are kept; only the link to the material is removed.',
      responses: {
        '204': emptyResponse('The material was deleted.'),
        '401': apiErrorResponse(401),
        '404': apiErrorResponse(
          404,
          'The material does not exist or belongs to another user (`MATERIAL_NOT_FOUND`).',
        ),
        '500': apiErrorResponse(500),
      },
    }),
    apiValidator('param', ProjectMaterialParams),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const removed = await service.remove(currentUserId(context), materialId);
      if (!removed) throw materialNotFound(materialId);
      return context.body(null, 204);
    },
  );

  return router;
}

export const projectMaterialsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => createProjectMaterialsRouter(app));
