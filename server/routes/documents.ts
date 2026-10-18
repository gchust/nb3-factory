import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  ApiError,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { APP_NS } from '@nocobase/i18n';
import { Hono } from 'hono';

import {
  documentAdministrationServiceToken,
  documentServiceToken,
  type CreateDocumentInput,
  type UpdateDocumentInput,
} from '../providers/documents.js';
import {
  documentCreateInput,
  documentIdParams,
  documentSchema,
  documentUpdateInput,
  documentUserListSchema,
  documentUserIdParams,
  documentUserQuery,
  documentUserRolesInput,
} from './schemas.js';

const permissionDenied = (): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'DOCUMENTS_ADMIN_DENIED',
    domain: APP_NS,
    message: 'Managing document role assignments is not allowed.',
  });

const notFound = (message: string): ApiError =>
  new ApiError({
    status: 'NOT_FOUND',
    reason: 'DOCUMENT_NOT_FOUND',
    domain: APP_NS,
    message,
  });

const userNotFound = (): ApiError =>
  new ApiError({
    status: 'NOT_FOUND',
    reason: 'DOCUMENT_USER_NOT_FOUND',
    domain: APP_NS,
    message: 'The user does not exist.',
  });

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    // Every document endpoint is backed by the Authentication and Authorization plugins, which this
    // application always registers. A runtime that assembles the application's routes without those
    // plugins (the template's runtime tests do) mounts no document endpoints instead of failing to start.
    if (
      !app.container.has(authenticationToken) ||
      !app.container.has(authorizationToken)
    ) {
      return new Hono();
    }

    const routes = new Hono<AuthorizationEnv & AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const docs = app.container.resolve(documentServiceToken);
    const administration = app.container.resolve(
      documentAdministrationServiceToken,
    );

    routes.use('/documents/*', auth.required(), authz.middleware());
    routes.use('/documents', auth.required(), authz.middleware());
    routes.use(
      '/documentsAdministration/*',
      auth.required(),
      authz.middleware(),
    );

    const policyFor = (context: {
      get: (key: 'authz') => AuthorizationEnv['Variables']['authz'];
    }) => authz.database.policyFor('documents', context.get('authz'));

    routes.get(
      '/documents',
      describeRoute({
        tags: ['Documents'],
        summary: 'List documents',
        operationId: 'listDocuments',
        responses: {
          '200': listResponse(documentSchema),
          '401': apiErrorResponse(401),
          '403': apiErrorResponse(403),
          '500': apiErrorResponse(500),
        },
      }),
      async (context) => {
        const data = await docs.list(await policyFor(context));
        return context.json({
          data,
          meta: { page: 1, pageSize: data.length, total: data.length },
        });
      },
    );

    routes.post(
      '/documents',
      describeRoute({
        tags: ['Documents'],
        summary: 'Create a document',
        operationId: 'createDocument',
        responses: {
          '200': dataResponse(documentSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', documentCreateInput),
      async (context) => {
        const input = context.req.valid('json') as CreateDocumentInput;
        const { user } = context.get('auth')!;
        const data = await docs.create(
          input,
          String(user.id),
          await policyFor(context),
        );
        return context.json({ data });
      },
    );

    routes.get(
      '/documents/:id',
      describeRoute({
        tags: ['Documents'],
        summary: 'Get a document',
        operationId: 'getDocument',
        responses: {
          '200': dataResponse(documentSchema),
          '401': apiErrorResponse(401),
          '403': apiErrorResponse(403),
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', documentIdParams),
      async (context) => {
        const { id } = context.req.valid('param');
        const data = await docs.get(id, await policyFor(context));
        if (!data) throw notFound('The document was not found.');
        return context.json({ data });
      },
    );

    routes.patch(
      '/documents/:id',
      describeRoute({
        tags: ['Documents'],
        summary: 'Update a document',
        operationId: 'updateDocument',
        responses: {
          '200': dataResponse(documentSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', documentIdParams),
      apiValidator('json', documentUpdateInput),
      async (context) => {
        const { id } = context.req.valid('param');
        const input = context.req.valid('json') as UpdateDocumentInput;
        const data = await docs.update(id, input, await policyFor(context));
        if (!data) throw notFound('The document was not found.');
        return context.json({ data });
      },
    );

    routes.delete(
      '/documents/:id',
      describeRoute({
        tags: ['Documents'],
        summary: 'Delete a document',
        operationId: 'deleteDocument',
        responses: {
          '204': emptyResponse(),
          '401': apiErrorResponse(401),
          '403': apiErrorResponse(403),
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', documentIdParams),
      async (context) => {
        const { id } = context.req.valid('param');
        const removed = await docs.remove(id, await policyFor(context));
        if (!removed) throw notFound('The document was not found.');
        return context.body(null, 204);
      },
    );

    routes.get(
      '/documentsAdministration/users',
      describeRoute({
        tags: ['Documents administration'],
        summary: 'List users and their document roles',
        operationId: 'listDocumentRoleAssignments',
        responses: {
          '200': dataResponse(documentUserListSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', documentUserQuery),
      async (context) => {
        if (
          !(await context.get('authz').can({
            resource: { type: 'settings', id: 'documents.administration' },
            action: 'read',
          }))
        ) {
          throw permissionDenied();
        }
        const data = await administration.listUsers(context.req.valid('query'));
        return context.json({ data });
      },
    );

    routes.put(
      '/documentsAdministration/users/:userId/roles',
      describeRoute({
        tags: ['Documents administration'],
        summary: 'Replace a user document roles',
        operationId: 'setDocumentRoleAssignments',
        responses: {
          '200': dataResponse(documentUserListSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', documentUserIdParams),
      apiValidator('json', documentUserRolesInput),
      async (context) => {
        if (
          !(await context.get('authz').can({
            resource: { type: 'settings', id: 'documents.administration' },
            action: 'manage',
          }))
        ) {
          throw permissionDenied();
        }
        const { userId } = context.req.valid('param');
        const { roles } = context.req.valid('json');
        try {
          await administration.setUserRoles(userId, roles);
        } catch (error) {
          if (error instanceof Error && error.message === 'User not found') {
            throw userNotFound();
          }
          throw error;
        }
        const data = await administration.listUsers({
          page: 1,
          pageSize: 100,
        });
        const user = data.users.find((item) => item.id === userId);
        return context.json({
          data: { users: user ? [user] : [], total: user ? 1 : 0 },
        });
      },
    );

    return routes as unknown as Hono;
  },
);
