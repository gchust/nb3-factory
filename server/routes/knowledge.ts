import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRepositoryApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  KNOWLEDGE_MATERIALS_COLLECTION,
  KNOWLEDGE_MATERIAL_CREATE_FIELDS,
  KNOWLEDGE_MATERIAL_READ_FIELDS,
  KNOWLEDGE_MATERIAL_UPDATE_FIELDS,
  knowledgeMaterialsResource,
} from '../knowledge/resources.js';

/** The Repository name the client calls; the Collection name is the same. */
const REPOSITORY = KNOWLEDGE_MATERIALS_COLLECTION;

/**
 * The materials Repository, generated rather than hand-written, then wrapped in the two checks it needs.
 *
 * `defineRepositoryApiRoutes` owns the envelope: which actions exist, what each may read from the body, and the 1 MiB
 * limit. Authentication and authorization are the wrapper's, because the generated adapter deliberately installs
 * neither. `authorizeRepository` resolves the caller into a Repository Policy and hands it to the generated route as a
 * request constraint, so the record scope a permission set stores is applied by the database — the route cannot
 * return a material the caller may not see, and a colleague cannot reach `createOne`/`updateOne` at all.
 *
 * The exposure's own Policy is the floor for a request that somehow skipped authorization: read is open only across
 * the declared columns, and create/update are bounded to the editable ones.
 */
export const knowledgeApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes(async (app: Application): Promise<Hono> => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);

    const materials = defineRepositoryApiRoutes({
      repositories: [
        {
          name: REPOSITORY,
          collection: KNOWLEDGE_MATERIALS_COLLECTION,
          policy: {
            read: { scope: true, fields: [...KNOWLEDGE_MATERIAL_READ_FIELDS] },
            create: {
              scope: true,
              fields: [...KNOWLEDGE_MATERIAL_CREATE_FIELDS],
            },
            update: {
              scope: true,
              fields: [...KNOWLEDGE_MATERIAL_UPDATE_FIELDS],
            },
            delete: false,
          },
          actions: {
            findMany: { maxLimit: 100 },
            findOne: {},
            count: {},
            createOne: {},
            updateOne: {},
          },
        },
      ],
    });

    // The contribution is mounted at `/api`, so middleware must name the paths this
    // route owns. A wildcard here would intercept every later `/api/*` request —
    // including paths this route does not serve — and answer 401 instead of
    // letting the SPA fallback handle it. The generated adapter mounts each action
    // at `/<repository>:<action>`.
    const materialsPath = `/${encodeURIComponent(REPOSITORY)}*`;
    router.use(materialsPath, authentication.required());
    router.use(
      materialsPath,
      authorization.database.authorizeRepository({
        repository: REPOSITORY,
        resource: knowledgeMaterialsResource.reference(),
        actions: {
          findMany: 'view',
          findOne: 'view',
          count: 'view',
          createOne: 'edit',
          updateOne: 'edit',
        },
      }),
    );
    router.route('/', await materials.createRouter(app));

    return router;
  });
