import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type {
  AuthorizationContext,
  AuthorizationEnv,
} from '@nocobase/authorization/core';
import type { RepositoryPolicy } from '@nocobase/db';
import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
} from '@nocobase/app-server/router';
import type { AppApiRouteContribution } from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

import { createLibraryAuthorization } from '../library-service.js';
import { libraryServiceToken } from '../providers/library.js';
import {
  CreateLibraryDocumentBody,
  LibraryDocumentListMeta,
  LibraryDocumentListQuery,
  LibraryDocumentParams,
  LibraryDocumentSchema,
  UpdateLibraryDocumentBody,
} from './schemas.js';

type LibraryAction = 'view' | 'create' | 'edit' | 'delete';

/** The request variables this router adds to the authentication ones. */
interface LibraryEnv {
  Variables: {
    authz: AuthorizationContext;
    libraryPolicy: RepositoryPolicy;
  };
}

type LibraryRouterEnv = AuthEnv & AuthorizationEnv & LibraryEnv;

/**
 * The document library API.
 *
 * Every route authorizes its composite action in middleware *before* the input
 * validators, so a caller without the operation learns nothing about the
 * request it should have sent and nothing is written. The resolved Repository
 * Policy travels on the request context; the handlers only use it and never
 * re-check permissions.
 */
export const libraryApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const root = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const service = app.container.resolve(libraryServiceToken);
    const authorization = createLibraryAuthorization();

    const library = new Hono<LibraryRouterEnv>();
    library.use('*', auth.required(), authz.middleware());

    /** Resolves the composite decision and stores its policy on the request. */
    const authorize = (action: LibraryAction) =>
      createMiddleware<LibraryRouterEnv>(async (context, next) => {
        context.set(
          'libraryPolicy',
          await authorization.policy(context.get('authz'), action),
        );
        await next();
      });

    library.get(
      '/',
      authorize('view'),
      describeRoute({
        tags: ['Library'],
        summary: 'List library documents',
        operationId: 'listLibraryDocuments',
        description:
          'The documents the caller may read: the ones they own, the published and non-confidential ones, and any an administrator shared with them. Paged by `page` and `pageSize`.',
        responses: {
          200: listResponse(LibraryDocumentSchema, LibraryDocumentListMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', LibraryDocumentListQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const result = await service.list(context.get('libraryPolicy'), {
          page,
          pageSize,
        });
        return context.json({
          data: result.rows,
          meta: { page, pageSize, total: result.total },
        });
      },
    );

    library.get(
      '/:documentId',
      authorize('view'),
      describeRoute({
        tags: ['Library'],
        summary: 'Get a library document',
        operationId: 'getLibraryDocument',
        description:
          'One document the caller may read. A document outside the caller\u2019s visibility answers `404`.',
        responses: {
          200: dataResponse(LibraryDocumentSchema, 'The document.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', LibraryDocumentParams),
      async (context) => {
        const { documentId } = context.req.valid('param');
        return context.json({
          data: await service.get(context.get('libraryPolicy'), documentId),
        });
      },
    );

    library.post(
      '/',
      authorize('create'),
      describeRoute({
        tags: ['Library'],
        summary: 'Create a library document',
        operationId: 'createLibraryDocument',
        description:
          'Creates a document owned by the caller. `ownerId` and `ownerName` are set by the server from the authenticated account.',
        responses: {
          201: dataResponse(LibraryDocumentSchema, 'The created document.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateLibraryDocumentBody),
      async (context) => {
        const principal = context.get('authz').identity.principal;
        const input = context.req.valid('json');
        const data = await service.create(context.get('libraryPolicy'), {
          title: input.title,
          content: input.content ?? null,
          published: input.published ?? false,
          confidential: input.confidential ?? false,
          ownerId: principal.id,
          ownerName: await service.accountName(principal.id),
        });
        return context.json({ data }, 201);
      },
    );

    library.patch(
      '/:documentId',
      authorize('edit'),
      describeRoute({
        tags: ['Library'],
        summary: 'Update a library document',
        operationId: 'updateLibraryDocument',
        description:
          'Changes the fields the body names on a document the caller may edit. A document the caller may not edit answers `404`, whether it exists or not.',
        responses: {
          200: dataResponse(LibraryDocumentSchema, 'The updated document.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', LibraryDocumentParams),
      apiValidator('json', UpdateLibraryDocumentBody),
      async (context) => {
        const { documentId } = context.req.valid('param');
        const input = context.req.valid('json');
        return context.json({
          data: await service.update(
            context.get('libraryPolicy'),
            documentId,
            input,
          ),
        });
      },
    );

    library.delete(
      '/:documentId',
      authorize('delete'),
      describeRoute({
        tags: ['Library'],
        summary: 'Delete a library document',
        operationId: 'deleteLibraryDocument',
        description:
          'Deletes a document the caller may delete. A document the caller may not delete answers `404`, whether it exists or not.',
        responses: {
          204: emptyResponse('The document was deleted.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', LibraryDocumentParams),
      async (context) => {
        const { documentId } = context.req.valid('param');
        await service.remove(context.get('libraryPolicy'), documentId);
        return context.body(null, 204);
      },
    );

    root.route('/library/documents', library);
    return root;
  });
