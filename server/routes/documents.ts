import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authorizationToken,
  type AppAuthorization,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import {
  authenticationToken,
  userAdministrationServiceToken,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';

import {
  createDocument,
  listDocuments,
  updateDocument,
  type LibraryDependencies,
} from '../library/documents.js';
import {
  LibraryDocumentInputSchema,
  LibraryDocumentListMetaSchema,
  LibraryDocumentParamsSchema,
  LibraryDocumentSchema,
} from './schemas.js';

/**
 * The document library's HTTP surface.
 *
 * Every route owns its own security: `auth.required()` looks the session up and
 * `authz.middleware()` resolves the caller's grants, both attached to the exact
 * path they protect so nothing leaks into another contribution. Each request
 * then reads and writes through a Policy the database layer enforces, which is
 * what makes reading stop short of editing.
 */
export default defineApiRoutes((app: Application) => {
  const routes = new Hono<AuthorizationEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authz: AppAuthorization = app.container.resolve(authorizationToken);
  const database: DatabaseManager = app.container.resolve(databaseManagerToken);
  const users: UserAdministrationService = app.container.resolve(
    userAdministrationServiceToken,
  );

  const dependencies = (context: AuthorizationContext): LibraryDependencies => {
    const connection: DatabaseConnection = database.connection();
    return { authz, context, connection, users };
  };

  routes.get(
    '/',
    describeRoute({
      tags: ['Document library'],
      summary: 'List the documents the caller may read',
      operationId: 'listLibraryDocuments',
      responses: {
        '200': listResponse(
          LibraryDocumentSchema,
          LibraryDocumentListMetaSchema,
          'Documents the caller is allowed to read',
        ),
        '401': apiErrorResponse(401),
        '403': apiErrorResponse(403),
        '500': apiErrorResponse(500),
      },
    }),
    auth.required(),
    authz.middleware(),
    async (context) => {
      const result = await listDocuments(dependencies(context.get('authz')));
      return context.json({
        data: [...result.items],
        meta: {
          total: result.total,
          canCreate: result.canCreate,
          editableIds: [...result.editableIds],
        },
      });
    },
  );

  routes.post(
    '/',
    describeRoute({
      tags: ['Document library'],
      summary: 'Create a document owned by the caller',
      operationId: 'createLibraryDocument',
      responses: {
        '200': dataResponse(LibraryDocumentSchema, 'The created document'),
        '401': apiErrorResponse(401),
        '403': apiErrorResponse(403),
        '500': apiErrorResponse(500),
      },
    }),
    auth.required(),
    authz.middleware(),
    apiValidator('json', LibraryDocumentInputSchema),
    async (context) => {
      const document = await createDocument(
        dependencies(context.get('authz')),
        context.req.valid('json'),
      );
      return context.json({ data: document });
    },
  );

  routes.patch(
    '/:id',
    describeRoute({
      tags: ['Document library'],
      summary: 'Update a document the caller may edit',
      operationId: 'updateLibraryDocument',
      responses: {
        '200': dataResponse(LibraryDocumentSchema, 'The updated document'),
        '401': apiErrorResponse(401),
        '403': apiErrorResponse(403),
        '404': apiErrorResponse(404),
        '500': apiErrorResponse(500),
      },
    }),
    auth.required(),
    authz.middleware(),
    apiValidator('param', LibraryDocumentParamsSchema),
    apiValidator('json', LibraryDocumentInputSchema),
    async (context) => {
      const { id } = context.req.valid('param');
      const document = await updateDocument(
        dependencies(context.get('authz')),
        id,
        context.req.valid('json'),
      );
      if (!document) {
        throw documentNotFound(id);
      }
      return context.json({ data: document });
    },
  );

  // The contribution's outer router is environment-agnostic, as the router
  // factory requires; the mounted router carries the authorization context the
  // handlers read.
  const router = new Hono();
  router.route('/documents', routes);
  return router;
}) satisfies AppApiRouteContribution<Application>;

function documentNotFound(id: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'LIBRARY_DOCUMENT_NOT_FOUND',
    domain: 'library',
    message: `No document the caller may edit has the id ${id}.`,
  });
}
