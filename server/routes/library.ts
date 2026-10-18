import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
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
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import type { Context } from 'hono';

import {
  LibraryForbiddenError,
  LibraryInvalidInputError,
  LibraryNotFoundError,
  libraryServiceToken,
  type LibraryActor,
  type LibraryService,
} from '../providers/library.js';
import {
  CreateMaterialInput,
  LibraryActorSchema,
  LibraryMaterialSchema,
  LibraryMemberSchema,
  LibraryShareSchema,
  MaterialParams,
  MaterialShareParams,
  MemberParams,
  SetMemberRoleInput,
  ShareMaterialInput,
  UpdateMaterialInput,
} from './schemas.js';

const tags = ['Library'];
const domain = 'library';

type LibraryEnv = AuthEnv & AuthorizationEnv;

/** Turns the library's own domain errors into the standard `/api` error body. */
function toLibraryApiError(error: unknown): ApiError | undefined {
  if (error instanceof LibraryNotFoundError) {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'MATERIAL_NOT_FOUND',
      domain,
      message: error.message,
    });
  }
  if (error instanceof LibraryForbiddenError) {
    return new ApiError({
      status: 'PERMISSION_DENIED',
      reason: 'LIBRARY_FORBIDDEN',
      domain,
      message: error.message,
    });
  }
  if (error instanceof LibraryInvalidInputError) {
    return new ApiError({
      status: 'INVALID_ARGUMENT',
      reason: 'INVALID_INPUT',
      domain,
      message: error.message,
    });
  }
  return undefined;
}

export const apiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>(({ container }) => {
    const router = new Hono();
    const routes = new Hono<LibraryEnv>();

    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const library: LibraryService = container.resolve(libraryServiceToken);

    routes.onError((error, context) =>
      apiErrorHandler(toLibraryApiError(error) ?? error, context),
    );
    // Scoped to this sub-router only: a `use('*')` on the outer router would leak into contributions mounted later.
    routes.use('*', authentication.required(), authorization.middleware());

    const actorOf = async (
      context: Context<LibraryEnv>,
    ): Promise<LibraryActor> => {
      const auth = context.get('auth');
      if (!auth) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain,
          message: 'A signed-in session is required.',
        });
      }
      const snapshot = await context.get('authz').snapshot();
      return library.resolveActor(auth.user.id, snapshot.unrestricted);
    };

    /**
     * Only administrators manage shares and personnel. The same signal the Client uses (`actor.isAdmin`): an
     * unrestricted session, or the root permission set. A page grant is deliberately not enough here — the page route
     * itself is `unrestricted`, so anyone who reaches these endpoints is an administrator.
     */
    const requireAdmin = async (
      context: Context<LibraryEnv>,
    ): Promise<void> => {
      const actor = await actorOf(context);
      if (!actor.isAdmin) {
        throw new LibraryForbiddenError(
          'Only an administrator may manage the library.',
        );
      }
    };

    routes.get(
      '/me',
      describeRoute({
        tags,
        summary: 'Read the current library identity',
        operationId: 'libraryGetCurrentActor',
        responses: {
          200: dataResponse(LibraryActorSchema, 'The current actor.'),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      async (context) => context.json({ data: await actorOf(context) }),
    );

    routes.get(
      '/materials',
      describeRoute({
        tags,
        summary: 'List the materials the current user may read',
        operationId: 'libraryListMaterials',
        responses: {
          200: listResponse(
            LibraryMaterialSchema,
            undefined,
            'The visible materials.',
          ),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      async (context) => {
        const materials = await library.listMaterials(await actorOf(context));
        return context.json({
          data: materials,
          meta: { total: materials.length },
        });
      },
    );

    routes.post(
      '/materials',
      describeRoute({
        tags,
        summary: 'Create a material',
        operationId: 'libraryCreateMaterial',
        responses: {
          201: dataResponse(LibraryMaterialSchema, 'The created material.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateMaterialInput),
      async (context) => {
        const material = await library.createMaterial(
          await actorOf(context),
          context.req.valid('json'),
        );
        return context.json({ data: material }, 201);
      },
    );

    routes.get(
      '/materials/:materialId',
      describeRoute({
        tags,
        summary: 'Read one material',
        operationId: 'libraryGetMaterial',
        responses: {
          200: dataResponse(LibraryMaterialSchema, 'The material.'),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', MaterialParams),
      async (context) => {
        const material = await library.getMaterial(
          await actorOf(context),
          context.req.valid('param').materialId,
        );
        return context.json({ data: material });
      },
    );

    routes.patch(
      '/materials/:materialId',
      describeRoute({
        tags,
        summary: 'Update one material',
        operationId: 'libraryUpdateMaterial',
        responses: {
          200: dataResponse(LibraryMaterialSchema, 'The updated material.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', MaterialParams),
      apiValidator('json', UpdateMaterialInput),
      async (context) => {
        const material = await library.updateMaterial(
          await actorOf(context),
          context.req.valid('param').materialId,
          context.req.valid('json'),
        );
        return context.json({ data: material });
      },
    );

    routes.delete(
      '/materials/:materialId',
      describeRoute({
        tags,
        summary: 'Delete one material',
        operationId: 'libraryDeleteMaterial',
        responses: {
          204: emptyResponse('The material and its shares were deleted.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', MaterialParams),
      async (context) => {
        await library.deleteMaterial(
          await actorOf(context),
          context.req.valid('param').materialId,
        );
        return context.body(null, 204);
      },
    );

    routes.get(
      '/materials/:materialId/shares',
      describeRoute({
        tags,
        summary: 'List who one material is temporarily shared with',
        operationId: 'libraryListMaterialShares',
        responses: {
          200: listResponse(
            LibraryShareSchema,
            undefined,
            'The current shares.',
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', MaterialParams),
      async (context) => {
        await requireAdmin(context);
        const shares = await library.listShares(
          await actorOf(context),
          context.req.valid('param').materialId,
        );
        return context.json({ data: shares, meta: { total: shares.length } });
      },
    );

    routes.post(
      '/materials/:materialId/shares',
      describeRoute({
        tags,
        summary: 'Temporarily share one material with a person',
        operationId: 'libraryShareMaterial',
        responses: {
          200: listResponse(
            LibraryShareSchema,
            undefined,
            'The shares after adding this one.',
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', MaterialParams),
      apiValidator('json', ShareMaterialInput),
      async (context) => {
        await requireAdmin(context);
        const shares = await library.shareMaterial(
          await actorOf(context),
          context.req.valid('param').materialId,
          context.req.valid('json').userId,
        );
        return context.json({ data: shares, meta: { total: shares.length } });
      },
    );

    routes.delete(
      '/materials/:materialId/shares/:userId',
      describeRoute({
        tags,
        summary: 'Revoke a temporary share of one material',
        operationId: 'libraryUnshareMaterial',
        responses: {
          200: listResponse(
            LibraryShareSchema,
            undefined,
            'The shares after revoking this one.',
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', MaterialShareParams),
      async (context) => {
        await requireAdmin(context);
        const params = context.req.valid('param');
        const shares = await library.unshareMaterial(
          await actorOf(context),
          params.materialId,
          params.userId,
        );
        return context.json({ data: shares, meta: { total: shares.length } });
      },
    );

    routes.get(
      '/users',
      describeRoute({
        tags,
        summary: 'List people and their library work roles',
        operationId: 'libraryListMembers',
        responses: {
          200: listResponse(LibraryMemberSchema, undefined, 'The people.'),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await requireAdmin(context);
        const members = await library.listMembers(await actorOf(context));
        return context.json({ data: members, meta: { total: members.length } });
      },
    );

    routes.put(
      '/users/:userId/role',
      describeRoute({
        tags,
        summary: "Set one person's library work role",
        operationId: 'librarySetMemberRole',
        responses: {
          200: dataResponse(LibraryMemberSchema, 'The updated person.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', MemberParams),
      apiValidator('json', SetMemberRoleInput),
      async (context) => {
        await requireAdmin(context);
        const member = await library.setMemberRole(
          await actorOf(context),
          context.req.valid('param').userId,
          context.req.valid('json').role,
        );
        return context.json({ data: member });
      },
    );

    router.route('/library', routes);
    return router;
  });
