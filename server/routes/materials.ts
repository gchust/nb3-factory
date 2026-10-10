import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
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
  defineRepositoryApiRoutes,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  MATERIALS_COLLECTION,
  MATERIALS_READ_FIELDS,
  MATERIALS_WRITE_FIELDS,
  materialsResource,
} from '../materials/declaration.js';
import { materialsServiceToken } from '../providers/materials-service.js';
import {
  MaterialListQuery,
  MaterialParams,
  MaterialSchema,
  MaterialsListMetaSchema,
  UpdateMaterialBody,
} from './schemas.js';

/**
 * The generated Repository endpoints for the same composite resource.
 *
 * They are a second, standard way to read and edit materials — `POST
 * /api/materials/findMany` and `/updateOne` — for tooling that speaks the
 * NocoBase data API. Their static policy is intentionally wide: the request's
 * `view`/`edit` decision, attached by `authorizeRepository`, is what actually
 * narrows them, so the two entry points cannot drift apart.
 */
const repositoryRoutes = defineRepositoryApiRoutes({
  repositories: [
    {
      name: MATERIALS_COLLECTION,
      collection: MATERIALS_COLLECTION,
      policy: {
        read: { scope: true, fields: [...MATERIALS_READ_FIELDS] },
        update: { scope: true, fields: [...MATERIALS_WRITE_FIELDS] },
        create: false,
        delete: false,
      },
      actions: {
        findMany: { maxLimit: 100 },
        findOne: {},
        count: {},
        updateOne: {},
      },
    },
  ],
});

const repositoryActions = {
  findMany: 'view',
  findOne: 'view',
  count: 'view',
  updateOne: 'edit',
} as const;

/**
 * The application-owned materials API.
 *
 * `GET /api/materials` and `GET /api/materials/:materialId` are what the
 * reading page calls; `PATCH` is what the supervisor's edit form calls. Every
 * one of them goes through {@link MaterialsService}, which authorizes the
 * request's scope before it touches a repository — the same scope the assistant
 * tool uses, so the page and the assistant can never disagree about what a
 * reader may see.
 */
export const apiRoutes = defineApiRoutes<Application>(async (app) => {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const materials = app.container.resolve(materialsServiceToken);

  const router = new Hono<AuthorizationEnv>();

  // Session, then the request's authorization context, on exactly the paths
  // this route owns. The repository endpoints below reuse the context this sets.
  router.use('/materials', auth.required(), authz.middleware());
  router.use('/materials/*', auth.required(), authz.middleware());

  // Bind each generated Repository action to the composite resource. The paths
  // are literal, so scoping to them cannot affect the custom routes below.
  for (const action of Object.keys(repositoryActions)) {
    router.use(
      `/materials/${action}`,
      authz.database.authorizeRepository({
        repository: MATERIALS_COLLECTION,
        resource: materialsResource,
        actions: repositoryActions,
      }),
    );
  }

  router.route('/', await repositoryRoutes.createRouter(app));

  router.get(
    '/materials',
    describeRoute({
      tags: ['Materials'],
      summary: 'List the internal materials the caller may read',
      operationId: 'listMaterials',
      responses: {
        '200': listResponse(MaterialSchema, MaterialsListMetaSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', MaterialListQuery),
    async (context) =>
      context.json(
        await materials.list(context.var.authz, context.req.valid('query')),
      ),
  );

  router.get(
    '/materials/:materialId',
    describeRoute({
      tags: ['Materials'],
      summary: 'Read one internal material the caller may read',
      operationId: 'getMaterial',
      responses: {
        '200': dataResponse(MaterialSchema),
        '404': apiErrorResponse(
          404,
          "No such material, or it is outside the caller's scope.",
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', MaterialParams),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const material = await materials.get(context.var.authz, materialId);
      if (!material) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'MATERIAL_NOT_FOUND',
          domain: 'materials',
          message: `Material ${materialId} was not found.`,
        });
      }
      return context.json({ data: material });
    },
  );

  router.patch(
    '/materials/:materialId',
    describeRoute({
      tags: ['Materials'],
      summary: 'Change the content of one internal material',
      operationId: 'updateMaterial',
      responses: {
        '200': dataResponse(MaterialSchema),
        '404': apiErrorResponse(
          404,
          "No such material, or it is outside the caller's scope.",
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', MaterialParams),
    apiValidator('json', UpdateMaterialBody),
    async (context) => {
      const { materialId } = context.req.valid('param');
      const values = context.req.valid('json');
      return context.json({
        data: await materials.update(context.var.authz, materialId, values),
      });
    },
  );

  // The router carries the authorization variables its middleware sets. The
  // API contribution is typed against a bare Hono, which the runtime does not
  // use to route, so the environment is erased here.
  return router as unknown as Hono;
});
