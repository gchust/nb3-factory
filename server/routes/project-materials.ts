import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  appErrorDomain,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthSession } from '@nocobase/app-plugin-authentication/server';
import { Hono, type Context } from 'hono';

import {
  MaterialFileOwnershipError,
  projectMaterialsServiceToken,
  type ProjectMaterialsService,
} from '../providers/project-materials.js';
import {
  CreateMaterialInputSchema,
  MaterialIdParamSchema,
  MaterialSchema,
  MaterialListSchema,
  UpdateMaterialInputSchema,
} from './schemas.js';

/**
 * The signed-in user's id, taken from the session and never from the request: ownership is what
 * isolates one user's materials from another's, so it must not be something a caller can supply.
 */
function currentUserId(context: Context): string {
  const session = context.get('auth') as AuthSession | undefined;
  const id = session?.user?.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTHENTICATION_REQUIRED',
      domain: appErrorDomain,
      message: 'Authentication required.',
    });
  }
  return id;
}

function notFound(id: number): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'PROJECT_MATERIAL_NOT_FOUND',
    domain: appErrorDomain,
    message: `Project material ${id} was not found.`,
  });
}

/** Answer a foreign attachment id as the permission failure it is, rather than as a missing one. */
async function owned<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MaterialFileOwnershipError) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'FILE_NOT_OWNED',
        domain: appErrorDomain,
        message: error.message,
        metadata: { fileIds: error.fileIds },
      });
    }
    throw error;
  }
}

export const projectMaterialRoutes: AppRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service: ProjectMaterialsService = app.container.resolve(
      projectMaterialsServiceToken,
    );

    // Ownership on every path below, and only on those. The literal alias has its own prefix, so
    // the wildcard does not reach it. Never `use('*')`: this router is mounted inside `/api` and a
    // catch-all would run for every other contribution's requests.
    router.use('/projectMaterials/*', auth.required());
    router.use('/projectMaterials:list', auth.required());

    router.get(
      '/projectMaterials',
      describeRoute({
        tags: ['Project materials'],
        summary: "List the current user's project materials",
        operationId: 'listProjectMaterials',
        responses: {
          200: dataResponse(MaterialListSchema),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      async (context) =>
        context.json({ data: await service.list(currentUserId(context)) }),
    );

    // Compatibility alias for clients that address the collection action directly. It answers the
    // same list, is registered as a literal path (never as the `:id` parameter), and is documented
    // as its own operation so the API document has no duplicate operation id.
    router.get(
      '/projectMaterials:list',
      describeRoute({
        tags: ['Project materials'],
        summary:
          "List the current user's project materials (compatibility alias)",
        operationId: 'listProjectMaterialsAlias',
        responses: {
          200: dataResponse(MaterialListSchema),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      async (context) =>
        context.json({ data: await service.list(currentUserId(context)) }),
    );

    router.post(
      '/projectMaterials',
      describeRoute({
        tags: ['Project materials'],
        summary:
          'Create a project material from a title and already-uploaded attachments',
        operationId: 'createProjectMaterial',
        responses: {
          201: dataResponse(MaterialSchema),
          401: apiErrorResponse(401),
          403: apiErrorResponse(403),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateMaterialInputSchema),
      async (context) => {
        const material = await owned(() =>
          service.create(currentUserId(context), context.req.valid('json')),
        );
        return context.json({ data: material }, 201);
      },
    );

    router.get(
      '/projectMaterials/:id',
      describeRoute({
        tags: ['Project materials'],
        summary: "Read one of the current user's project materials",
        operationId: 'getProjectMaterial',
        responses: {
          200: dataResponse(MaterialSchema),
          401: apiErrorResponse(401),
          404: apiErrorResponse(404),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', MaterialIdParamSchema),
      async (context) => {
        const { id } = context.req.valid('param');
        const material = await service.get(currentUserId(context), id);
        if (!material) throw notFound(id);
        return context.json({ data: material });
      },
    );

    router.patch(
      '/projectMaterials/:id',
      describeRoute({
        tags: ['Project materials'],
        summary: "Update a project material's title or its set of attachments",
        operationId: 'updateProjectMaterial',
        responses: {
          200: dataResponse(MaterialSchema),
          401: apiErrorResponse(401),
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', MaterialIdParamSchema),
      apiValidator('json', UpdateMaterialInputSchema),
      async (context) => {
        const { id } = context.req.valid('param');
        const material = await owned(() =>
          service.update(currentUserId(context), id, context.req.valid('json')),
        );
        if (!material) throw notFound(id);
        return context.json({ data: material });
      },
    );

    return router;
  });
