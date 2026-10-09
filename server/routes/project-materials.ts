import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  describeRoute,
  emptyResponse,
  listResponse,
  type AppApiRouteContribution,
  defineApiRoutes,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  ProjectMaterialInputError,
  projectMaterialsServiceToken,
} from '../providers/project-materials.js';
import {
  CreateProjectMaterialInput,
  ListProjectMaterialsQuery,
  ProjectMaterialListMeta,
  ProjectMaterialParams,
  ProjectMaterialSchema,
  UpdateProjectMaterialInput,
} from './schemas.js';

/** The tag and the domain this application's material errors and the API document use. */
const MATERIALS_TAG = 'ProjectMaterials';
const MATERIALS_DOMAIN = 'projectMaterials';

const materialNotFound = apiErrorResponse(
  404,
  'No material of the caller has this id (`MATERIAL_NOT_FOUND`).',
);
/** These endpoints authenticate but never check a permission, so they declare no `403`. */
const materialErrorResponses = {
  '401': apiErrorResponse(401),
  '500': apiErrorResponse(500),
} as const;
const materialInputInvalid = apiErrorResponse(
  400,
  'A field is invalid: a title is required (`INVALID_INPUT`), or `fileIds` names a file the caller does not own or one that is not a PNG or DOCX (`INVALID_INPUT`).',
);

/** A service failure turned into the standard error body; anything else is rethrown for the application. */
function toApiError(error: unknown): never {
  if (error instanceof ProjectMaterialInputError) {
    throw new ApiError({
      status: 'INVALID_ARGUMENT',
      reason: 'INVALID_INPUT',
      domain: MATERIALS_DOMAIN,
      message: error.message,
      fieldViolations: [{ field: error.field, description: error.message }],
    });
  }
  throw error;
}

/** The signed-in user's id; `auth.required()` already refused a request without a session. */
function requireUserId(context: Context): string {
  const userId = (context as Context<AuthEnv>).get('auth')?.user.id;
  if (!userId) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTHENTICATION_REQUIRED',
      domain: MATERIALS_DOMAIN,
      message: 'A signed-in user is required.',
    });
  }
  return userId;
}

function notFound(): never {
  throw new ApiError({
    status: 'NOT_FOUND',
    reason: 'MATERIAL_NOT_FOUND',
    domain: MATERIALS_DOMAIN,
    message: 'No material of the caller has this id.',
  });
}

/**
 * Project materials and their attachments, scoped to the signed-in user.
 *
 * The material endpoints are the application's own rather than generated Repository endpoints, because every read and
 * write has to be scoped to `createdById` and the detail view has to return each attachment with the `contentUrl` the
 * browser uses. The file records are created by the file plugin's upload endpoint under `/projectMaterialFiles`; these
 * endpoints only link and unlink them, so removing an attachment never destroys it.
 */
export const projectMaterialApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const materials = app.container.resolve(projectMaterialsServiceToken);

    router.get(
      '/projectMaterials',
      auth.required(),
      describeRoute({
        tags: [MATERIALS_TAG],
        summary: 'List the materials of the signed-in user',
        operationId: 'projectMaterialsList',
        description:
          'Newest first. A material of another user is never returned; the caller sees only their own.',
        responses: {
          '200': listResponse(ProjectMaterialSchema, ProjectMaterialListMeta),
          ...materialErrorResponses,
        },
      }),
      apiValidator('query', ListProjectMaterialsQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const result = await materials.list(requireUserId(context), {
          page,
          pageSize,
        });
        return context.json({
          data: result.materials,
          meta: { page, pageSize, total: result.total },
        });
      },
    );

    router.post(
      '/projectMaterials',
      auth.required(),
      describeRoute({
        tags: [MATERIALS_TAG],
        summary: 'Create a material',
        operationId: 'projectMaterialsCreate',
        description:
          'The title is required. `fileIds` names files already uploaded through `/projectMaterialFiles/uploadOne`; saving links them, so a retry after a failed save does not upload them again.',
        responses: {
          '201': dataResponse(ProjectMaterialSchema, 'The created material.'),
          ...materialErrorResponses,
          '400': materialInputInvalid,
        },
      }),
      apiValidator('json', CreateProjectMaterialInput),
      async (context) => {
        try {
          const material = await materials.create(
            requireUserId(context),
            context.req.valid('json'),
          );
          return context.json({ data: material }, 201);
        } catch (error) {
          return toApiError(error);
        }
      },
    );

    router.get(
      '/projectMaterials/:materialId',
      auth.required(),
      describeRoute({
        tags: [MATERIALS_TAG],
        summary: 'Get a material with its attachments',
        operationId: 'projectMaterialsGet',
        responses: {
          '200': dataResponse(ProjectMaterialSchema),
          ...materialErrorResponses,
          '404': materialNotFound,
        },
      }),
      apiValidator('param', ProjectMaterialParams),
      async (context) => {
        const material = await materials.get(
          requireUserId(context),
          context.req.valid('param').materialId,
        );
        if (!material) notFound();
        return context.json({ data: material });
      },
    );

    router.patch(
      '/projectMaterials/:materialId',
      auth.required(),
      describeRoute({
        tags: [MATERIALS_TAG],
        summary: 'Update a material',
        operationId: 'projectMaterialsUpdate',
        description:
          'Changes the fields given and keeps the rest. `fileIds`, when present, is the complete set of attachments: files linked before but absent now are detached and never deleted.',
        responses: {
          '200': dataResponse(ProjectMaterialSchema, 'The updated material.'),
          ...materialErrorResponses,
          '400': materialInputInvalid,
          '404': materialNotFound,
        },
      }),
      apiValidator('param', ProjectMaterialParams),
      apiValidator('json', UpdateProjectMaterialInput),
      async (context) => {
        try {
          const material = await materials.update(
            requireUserId(context),
            context.req.valid('param').materialId,
            context.req.valid('json'),
          );
          if (!material) notFound();
          return context.json({ data: material });
        } catch (error) {
          return toApiError(error);
        }
      },
    );

    router.delete(
      '/projectMaterials/:materialId',
      auth.required(),
      describeRoute({
        tags: [MATERIALS_TAG],
        summary: 'Delete a material',
        operationId: 'projectMaterialsDelete',
        description:
          'Deletes the material and detaches its attachments. The files themselves are kept, never destroyed.',
        responses: {
          '204': emptyResponse('The material was deleted.'),
          ...materialErrorResponses,
          '404': materialNotFound,
        },
      }),
      apiValidator('param', ProjectMaterialParams),
      async (context) => {
        const removed = await materials.remove(
          requireUserId(context),
          context.req.valid('param').materialId,
        );
        if (!removed) notFound();
        return context.body(null, 204);
      },
    );

    return router;
  });
