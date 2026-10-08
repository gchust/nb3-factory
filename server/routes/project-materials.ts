import type { Application } from '@nocobase/app-server/application';
import type { AppApiRouteContribution } from '@nocobase/app-server/router';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import {
  materialServiceToken,
  MaterialServiceError,
  type MaterialServiceErrorCode,
} from '../providers/material-service.js';
import {
  CreateMaterialInput,
  MaterialPageMeta,
  MaterialParams,
  MaterialSchema,
  UpdateMaterialInput,
} from './schemas.js';

/**
 * The project-material API. Every path is scoped to the signed-in user: there
 * is no endpoint that takes an owner, so one person cannot address another
 * person's material or attachment at all.
 */

const tags = ['ProjectMaterials'];
const unauthenticated = {
  401: apiErrorResponse(401),
  500: apiErrorResponse(500),
};
const ownedErrors = { ...unauthenticated, 404: apiErrorResponse(404) };

export const projectMaterialApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app: Application) => {
    const router = new Hono();
    const routes = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const materials = app.container.resolve(materialServiceToken);

    routes.onError((error, context) =>
      apiErrorHandler(toMaterialApiError(error) ?? error, context),
    );
    // `authentication.required()` is typed against the authentication plugin's
    // environment; a contribution's router is a plain Hono router.
    routes.use('*', authentication.required() as MiddlewareHandler);

    routes.get(
      '/',
      describeRoute({
        tags,
        summary: 'List the materials owned by the caller',
        operationId: 'projectMaterialsList',
        responses: {
          200: listResponse(MaterialSchema, MaterialPageMeta),
          ...unauthenticated,
        },
      }),
      async (context) => {
        const items = await materials.list(ownerId(context));
        return context.json({
          data: items,
          meta: { total: items.length },
        });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags,
        summary: 'Create a material',
        operationId: 'projectMaterialsCreate',
        description:
          'The attachments are the ids of files the caller already uploaded; a file owned by someone else is refused.',
        responses: {
          201: dataResponse(MaterialSchema, 'The created material.'),
          ...unauthenticated,
          400: apiErrorResponse(
            400,
            'The title is blank (`MATERIAL_TITLE_REQUIRED`), or one of the attachments does not exist (`MATERIAL_FILE_NOT_FOUND`).',
          ),
        },
      }),
      apiValidator('json', CreateMaterialInput),
      async (context) => {
        const input = context.req.valid('json');
        const material = await materials.create(ownerId(context), input);
        return context.json({ data: material }, 201);
      },
    );

    routes.get(
      '/:materialId',
      describeRoute({
        tags,
        summary: 'Read one material owned by the caller',
        operationId: 'projectMaterialsGet',
        responses: {
          200: dataResponse(MaterialSchema),
          ...ownedErrors,
        },
      }),
      apiValidator('param', MaterialParams),
      async (context) => {
        const { materialId } = context.req.valid('param');
        const material = await materials.get(ownerId(context), materialId);
        if (!material) {
          throw notFound();
        }
        return context.json({ data: material });
      },
    );

    routes.patch(
      '/:materialId',
      describeRoute({
        tags,
        summary: 'Update a material',
        operationId: 'projectMaterialsUpdate',
        description:
          '`fileIds` is the complete set of attachments the material should have: a file attached before that is missing from it is unlinked, not deleted.',
        responses: {
          200: dataResponse(MaterialSchema),
          ...ownedErrors,
          400: apiErrorResponse(
            400,
            'The title is blank (`MATERIAL_TITLE_REQUIRED`), or one of the attachments does not exist (`MATERIAL_FILE_NOT_FOUND`).',
          ),
        },
      }),
      apiValidator('param', MaterialParams),
      apiValidator('json', UpdateMaterialInput),
      async (context) => {
        const { materialId } = context.req.valid('param');
        const material = await materials.update(
          ownerId(context),
          materialId,
          context.req.valid('json'),
        );
        return context.json({ data: material });
      },
    );

    router.route('/projectMaterials', routes);
    return router;
  });

function ownerId(context: Context): string {
  const session = (context as Context<AuthEnv>).get('auth');
  if (!session?.user) {
    // Unreachable while `authentication.required()` runs first; kept so the
    // handler never runs without an owner.
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTHENTICATION_REQUIRED',
      domain: 'authentication',
      message: 'Authentication required.',
    });
  }
  return session.user.id;
}

function notFound(): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'MATERIAL_NOT_FOUND',
    domain: 'projectMaterials',
    message: 'This material does not exist.',
  });
}

/** The HTTP answer for a domain failure, or `undefined` for anything unexpected. */
function toMaterialApiError(error: unknown): ApiError | undefined {
  if (!(error instanceof MaterialServiceError)) {
    return undefined;
  }
  const status: Record<
    MaterialServiceErrorCode,
    'NOT_FOUND' | 'INVALID_ARGUMENT'
  > = {
    MATERIAL_NOT_FOUND: 'NOT_FOUND',
    MATERIAL_FILE_NOT_FOUND: 'INVALID_ARGUMENT',
    MATERIAL_TITLE_REQUIRED: 'INVALID_ARGUMENT',
  };
  return new ApiError({
    status: status[error.code],
    reason: error.code,
    domain: 'projectMaterials',
    message: error.message,
    cause: error,
  });
}
