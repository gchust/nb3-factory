import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
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
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Context } from 'hono';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import {
  materialSelector,
  scopedMaterialsRepository,
  toMaterialView,
} from '../materials/read.js';
import {
  MATERIALS_COLLECTION,
  materialsResource,
} from '../materials/resources.js';
import {
  GetMaterialQuery,
  ListMaterialsQuery,
  MaterialSchema,
  type GetMaterialQueryInput,
  type ListMaterialsQueryInput,
} from './schemas.js';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Generated Repository endpoints for the `materials` collection:
 * `POST /api/materials/findMany`, `/findOne`, `/count`, `/createOne`,
 * `/updateOne` and `/deleteOne`.
 *
 * The static Policy is the widest the exposure may ever be; the authorization
 * middleware below narrows it to the caller's composite `app.materials` grants.
 * It is deliberately permissive here so that a supervisor's `allRecords` scope
 * can read the confidential row, while a colleague's `materials.public` scope
 * intersects to `confidential = false`.
 */
const repositoryRoutes = defineRepositoryApiRoutes({
  repositories: [
    {
      name: MATERIALS_COLLECTION,
      collection: MATERIALS_COLLECTION,
      policy: {
        read: {
          scope: true,
          fields: ['id', 'title', 'body', 'confidential'],
        },
        create: { scope: true, fields: ['title', 'body'] },
        update: { scope: true, fields: ['title', 'body'] },
        delete: { scope: true },
      },
      actions: {
        findMany: { maxLimit: 200 },
        findOne: {},
        count: {},
        createOne: {},
        updateOne: {},
        deleteOne: {},
      },
    },
  ],
});

/**
 * Lists the materials the caller may read, paged.
 *
 * `authorize` runs before any query: without a `view` grant the handler throws
 * `403`, and a colleague's scope is `confidential = false`, so the confidential
 * row is never selected or counted.
 */
async function listMaterials(
  context: Context<AuthorizationEnv>,
  query: ListMaterialsQueryInput,
  database: DatabaseManager,
) {
  const repository = await scopedMaterialsRepository(
    context.var.authz,
    database,
  );
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const filter = query.q
    ? buildFilter((f) =>
        f.or([
          f
            .string('title')
            .includes(query.q as string, { mode: 'insensitive' }),
          f.string('body').includes(query.q as string, { mode: 'insensitive' }),
        ]),
      )
    : undefined;
  const [rows, total] = await Promise.all([
    repository.findMany({
      filter,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    repository.count({ filter }),
  ]);
  return context.json({
    data: rows.map(toMaterialView),
    meta: { total, page, pageSize },
  });
}

/**
 * Reads one material the caller may read.
 *
 * A selector that would match the confidential row is evaluated inside the
 * caller's scope, so a colleague gets `404` — the row is not merely hidden, it
 * is outside the query and cannot be reached by id either.
 */
async function getMaterial(
  context: Context<AuthorizationEnv>,
  query: GetMaterialQueryInput,
  database: DatabaseManager,
) {
  const selector = materialSelector(query);
  if (!Object.keys(selector).length) {
    throw new ApiError({
      status: 'INVALID_ARGUMENT',
      reason: 'MATERIAL_SELECTOR_REQUIRED',
      domain: 'materials',
      message: 'Provide an id or a filter selecting one material.',
      fieldViolations: [
        { field: 'id', description: 'An id or a filter is required.' },
      ],
    });
  }
  const repository = await scopedMaterialsRepository(
    context.var.authz,
    database,
  );
  const row = await repository.findOne({ filter: selector });
  if (!row) {
    throw new ApiError({
      status: 'NOT_FOUND',
      reason: 'MATERIAL_NOT_FOUND',
      domain: 'materials',
      message: 'The material was not found.',
    });
  }
  return context.json({ data: toMaterialView(row) });
}

/**
 * The materials router, typed with the authorization environment so its
 * handlers can read `context.var.authz`.
 *
 * Authentication and authorization are installed on this router's own paths
 * first: every request is resolved to an identity and a `context.var.authz`
 * context, so the hand-written read routes can authorize through the same
 * `app.materials` resource the Repository endpoints use. `authorizeRepository`
 * then narrows each Repository action to the composite action that governs it,
 * refusing a method with no mapping — or a caller without the matching grant —
 * before the Repository runs. It claims only `POST /{collection}/{action}`,
 * so the `GET` read routes below pass through it untouched.
 */
async function createMaterialsRouter(
  app: Application,
): Promise<Hono<AuthorizationEnv>> {
  const authorization = app.container.resolve(authorizationToken);
  const database = app.container.resolve(databaseManagerToken);
  const router = new Hono<AuthorizationEnv>();

  const materialsMiddleware = [
    app.container.resolve(authenticationToken).required(),
    bodyLimit({ maxSize: 64 * 1024 }),
    authorization.middleware(),
    authorization.database.authorizeRepository({
      repository: MATERIALS_COLLECTION,
      resource: materialsResource.reference(),
      actions: {
        findMany: 'view',
        findOne: 'view',
        count: 'view',
        createOne: 'create',
        updateOne: 'edit',
        deleteOne: 'delete',
      },
    }),
  ];

  // Scope the middleware to the paths this router owns. `use('*')` would also
  // run on every other contribution mounted under `/api` and answer their
  // unknown paths with 401 instead of the framework's 404. `/materials/*`
  // matches `/materials` itself, which Hono treats as zero sub-segments.
  for (const path of ['/materials/*', '/materials:list', '/materials:get']) {
    router.use(path, ...materialsMiddleware);
  }

  // The application's REST read of a collection. Registered before the
  // Repository routes; the `GET` methods never reach `authorizeRepository`,
  // which only claims `POST /{collection}/{action}`.
  router.get(
    '/materials',
    describeRoute({
      tags: ['Materials'],
      summary: 'List materials',
      operationId: 'listMaterials',
      description:
        'Lists the materials the caller is allowed to read. A colleague reads the non-confidential materials only; a supervisor reads every material.',
      responses: {
        '200': listResponse(
          MaterialSchema,
          undefined,
          'The readable materials.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', ListMaterialsQuery),
    (context) => listMaterials(context, context.req.valid('query'), database),
  );

  // Compatibility alias for the legacy NocoBase resource shape
  // `/materials:list`, which external probes and older clients still call.
  // It is the same authorized read as `GET /materials`.
  router.get(
    '/materials:list',
    describeRoute({
      tags: ['Materials'],
      summary: 'List materials (legacy resource shape)',
      operationId: 'listMaterialsLegacy',
      description:
        'Compatibility alias for `GET /materials` at the legacy `/materials:list` shape. Same authorization and same body.',
      responses: {
        '200': listResponse(
          MaterialSchema,
          undefined,
          'The readable materials.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', ListMaterialsQuery),
    (context) => listMaterials(context, context.req.valid('query'), database),
  );

  router.get(
    '/materials:get',
    describeRoute({
      tags: ['Materials'],
      summary: 'Get one material',
      operationId: 'getMaterial',
      description:
        'Reads one material by id, or by a JSON `filter` naming id, title or confidential. A material the caller may not read is answered `404`, so its existence is not revealed.',
      responses: {
        '200': dataResponse(MaterialSchema, 'The material.'),
        '404': apiErrorResponse(404, 'The material was not found.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', GetMaterialQuery),
    (context) => getMaterial(context, context.req.valid('query'), database),
  );

  router.route('/', await repositoryRoutes.createRouter(app));
  return router;
}

/**
 * Mounts the materials API under `/api`.
 *
 * The framework's route contract types a contribution as a plain `Hono`, while
 * the handlers need the authorization environment. This outer router carries
 * no handler of its own: it mounts the typed router above at `/`, which is how
 * the authorization plugin mounts its own environment-carrying router too.
 */
export const materialsRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>(async (app) => {
    const router = new Hono();
    router.route('/', await createMaterialsRouter(app));
    return router;
  });
