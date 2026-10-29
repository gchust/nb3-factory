import { authenticationToken } from '@nocobase/app-plugin-authentication';
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
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';

import { LIBRARY_SHARE_SETTINGS_ID } from '../library/resources.js';
import { libraryServiceToken } from '../providers/library.js';
import {
  CreateLibraryDocument,
  CreateLibraryShare,
  LibraryAdminDocument,
  LibraryAdminUser,
  LibraryDocument,
  LibraryDocumentParams,
  LibraryPageQuery,
  LibraryShare,
  LibraryShareParams,
  UpdateLibraryDocument,
} from './library-schemas.js';

export const libraryRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const library = app.container.resolve(libraryServiceToken);

    routes.use('*', auth.required(), authorization.middleware());

    const requireSettings =
      (action: 'read' | 'update'): MiddlewareHandler<AuthorizationEnv> =>
      async (context, next) => {
        await context.get('authz').require({
          resource: { type: 'settings', id: LIBRARY_SHARE_SETTINGS_ID },
          action,
        });
        await next();
      };

    routes.get(
      '/documents',
      describeRoute({
        tags: ['Library'],
        summary: 'List the documents the signed-in person may read',
        operationId: 'listLibraryDocuments',
        responses: {
          '200': listResponse(LibraryDocument),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', LibraryPageQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const result = library(context.get('authz')).listDocuments({
          page,
          pageSize,
        });
        const { rows, total } = await result;
        return context.json({
          data: rows,
          meta: { page, pageSize, total },
        });
      },
    );

    routes.get(
      '/documents/:documentId',
      describeRoute({
        tags: ['Library'],
        summary: 'Read one document',
        operationId: 'getLibraryDocument',
        responses: {
          '200': dataResponse(LibraryDocument),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', LibraryDocumentParams),
      async (context) => {
        const { documentId } = context.req.valid('param');
        return context.json({
          data: await library(context.get('authz')).getDocument(documentId),
        });
      },
    );

    routes.post(
      '/documents',
      describeRoute({
        tags: ['Library'],
        summary: 'Create a document',
        operationId: 'createLibraryDocument',
        responses: {
          '201': dataResponse(LibraryDocument),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateLibraryDocument),
      async (context) => {
        const input = context.req.valid('json');
        return context.json(
          {
            data: await library(context.get('authz')).createDocument(input),
          },
          201,
        );
      },
    );

    routes.patch(
      '/documents/:documentId',
      describeRoute({
        tags: ['Library'],
        summary: 'Change a document you own',
        operationId: 'updateLibraryDocument',
        responses: {
          '200': dataResponse(LibraryDocument),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', LibraryDocumentParams),
      apiValidator('json', UpdateLibraryDocument),
      async (context) => {
        const { documentId } = context.req.valid('param');
        return context.json({
          data: await library(context.get('authz')).updateDocument(
            documentId,
            context.req.valid('json'),
          ),
        });
      },
    );

    routes.delete(
      '/documents/:documentId',
      describeRoute({
        tags: ['Library'],
        summary: 'Delete a document you own',
        operationId: 'deleteLibraryDocument',
        responses: {
          '204': { description: 'The document and its shares are deleted.' },
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', LibraryDocumentParams),
      async (context) => {
        const { documentId } = context.req.valid('param');
        await library(context.get('authz')).deleteDocument(documentId);
        return context.body(null, 204);
      },
    );

    routes.get(
      '/admin/documents',
      requireSettings('read'),
      describeRoute({
        tags: ['Library administration'],
        summary: 'List every document and its temporary shares',
        operationId: 'listAdminLibraryDocuments',
        responses: {
          '200': listResponse(LibraryAdminDocument),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', LibraryPageQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const { rows, total } = await library(
          context.get('authz'),
        ).listAdminDocuments({ page, pageSize });
        return context.json({
          data: rows,
          meta: { page, pageSize, total },
        });
      },
    );

    routes.get(
      '/admin/users',
      requireSettings('read'),
      describeRoute({
        tags: ['Library administration'],
        summary: 'List enabled people who can receive a share',
        operationId: 'listAdminLibraryUsers',
        responses: {
          '200': listResponse(LibraryAdminUser),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const users = await library(context.get('authz')).listAdminUsers();
        return context.json({ data: users, meta: { total: users.length } });
      },
    );

    routes.post(
      '/shares',
      requireSettings('update'),
      describeRoute({
        tags: ['Library administration'],
        summary: 'Share a draft with one person',
        operationId: 'createLibraryShare',
        responses: {
          '201': dataResponse(LibraryShare),
          ...apiErrorResponses,
          '400': apiErrorResponse(
            400,
            'The document is confidential or the user is not an enabled person.',
          ),
          '409': apiErrorResponse(409, 'That person already has a share.'),
        },
      }),
      apiValidator('json', CreateLibraryShare),
      async (context) => {
        const { documentId, userId } = context.req.valid('json');
        return context.json(
          {
            data: await library(context.get('authz')).createShare(
              documentId,
              userId,
            ),
          },
          201,
        );
      },
    );

    routes.delete(
      '/shares/:shareId',
      requireSettings('update'),
      describeRoute({
        tags: ['Library administration'],
        summary: 'Revoke a temporary share immediately',
        operationId: 'deleteLibraryShare',
        responses: {
          '204': { description: 'The share is revoked.' },
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', LibraryShareParams),
      async (context) => {
        const { shareId } = context.req.valid('param');
        await library(context.get('authz')).deleteShare(shareId);
        return context.body(null, 204);
      },
    );

    router.route('/library', routes);
    return router;
  });
