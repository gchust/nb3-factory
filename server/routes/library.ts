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
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { Hono, type Context, type Next } from 'hono';

import { LIBRARY_RESOURCE } from '../library-resources.js';
import {
  LibraryDocumentNotFoundError,
  LibraryDocumentNotShareableError,
} from '../library-service.js';
import { libraryServiceToken } from '../providers/index.js';
import {
  CreateLibraryDocumentInput,
  LibraryDocument,
  LibraryDocumentIdParams,
  LibraryDocumentShareCandidate,
  LibraryShareCandidatesQuery,
  ListLibraryDocumentsQuery,
  SetLibraryDocumentSharesInput,
  UpdateLibraryDocumentInput,
} from './schemas.js';

const TAG = 'Library';

function requireLibraryAction(action: string) {
  return async (context: Context<AuthorizationEnv>, next: Next) => {
    const decision = await context.get('authz').authorize({
      resource: { type: 'composite', id: LIBRARY_RESOURCE },
      action,
    });
    // A composite decision is conditional even when every underlying check passes: its conditions carry the
    // database policies the service applies. Only a flat denial means the caller lacks the action.
    if (decision.effect === 'deny') {
      throw new AuthorizationDeniedError(decision);
    }
    await next();
  };
}

function toNotFoundApiError(error: unknown): unknown {
  if (error instanceof LibraryDocumentNotShareableError) {
    return new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: 'LIBRARY_DOCUMENT_NOT_SHAREABLE',
      domain: 'library',
      message: 'Confidential documents cannot be shared.',
    });
  }
  if (!(error instanceof LibraryDocumentNotFoundError)) return error;
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'LIBRARY_DOCUMENT_NOT_FOUND',
    domain: 'library',
    message: 'The document does not exist or is not available to you.',
  });
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const library = app.container.resolve(libraryServiceToken);

    routes.use('*', auth.required(), authorization.middleware());
    routes.onError((error, context) =>
      apiErrorHandler(toNotFoundApiError(error), context),
    );

    routes.get(
      '/documents',
      requireLibraryAction('view'),
      describeRoute({
        tags: [TAG],
        summary: 'List the documents the caller may read',
        operationId: 'listLibraryDocuments',
        responses: {
          '200': listResponse(
            LibraryDocument,
            undefined,
            'Documents the caller may read.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListLibraryDocumentsQuery),
      async (context) => {
        const { q, page, pageSize, mine } = context.req.valid('query');
        const result = await library.list({
          authorization: context.get('authz'),
          ...(q === undefined ? {} : { search: q }),
          ...(mine === undefined ? {} : { ownedOnly: true }),
          page,
          pageSize,
        });
        return context.json({
          data: result.items,
          meta: { page, pageSize, total: result.total },
        });
      },
    );

    routes.get(
      '/shareCandidates',
      requireLibraryAction('edit'),
      describeRoute({
        tags: [TAG],
        summary: 'List people a document may be shared with',
        operationId: 'listLibraryShareCandidates',
        responses: {
          '200': listResponse(
            LibraryDocumentShareCandidate,
            undefined,
            'People the caller may choose.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', LibraryShareCandidatesQuery),
      async (context) => {
        const { excludeUserId } = context.req.valid('query');
        const candidates = await library.shareCandidates(
          excludeUserId ?? context.get('authz').identity.principal.id,
        );
        return context.json({
          data: candidates,
          meta: { total: candidates.length },
        });
      },
    );

    routes.get(
      '/documents/:documentId',
      requireLibraryAction('view'),
      describeRoute({
        tags: [TAG],
        summary: 'Read one document',
        operationId: 'getLibraryDocument',
        responses: {
          '200': dataResponse(LibraryDocument),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', LibraryDocumentIdParams),
      async (context) => {
        const { documentId } = context.req.valid('param');
        return context.json({
          data: await library.get(context.get('authz'), documentId),
        });
      },
    );

    routes.get(
      '/documents/:documentId/shares',
      requireLibraryAction('edit'),
      describeRoute({
        tags: [TAG],
        summary: 'List the people one document is shared with',
        operationId: 'listLibraryDocumentShares',
        responses: {
          '200': listResponse(
            LibraryDocumentShareCandidate,
            undefined,
            'People this document is shared with.',
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', LibraryDocumentIdParams),
      async (context) => {
        const { documentId } = context.req.valid('param');
        const shares = await library.listShares(
          context.get('authz'),
          documentId,
        );
        return context.json({ data: shares, meta: { total: shares.length } });
      },
    );

    routes.put(
      '/documents/:documentId/shares',
      requireLibraryAction('edit'),
      describeRoute({
        tags: [TAG],
        summary: 'Replace the people one document is shared with',
        operationId: 'setLibraryDocumentShares',
        responses: {
          '200': listResponse(
            LibraryDocumentShareCandidate,
            undefined,
            'People this document is now shared with.',
          ),
          ...apiErrorResponses,
          '400': apiErrorResponse(400),
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', LibraryDocumentIdParams),
      apiValidator('json', SetLibraryDocumentSharesInput),
      async (context) => {
        const { documentId } = context.req.valid('param');
        const { userIds } = context.req.valid('json');
        const shares = await library.setShares(
          context.get('authz'),
          documentId,
          userIds,
        );
        return context.json({ data: shares, meta: { total: shares.length } });
      },
    );

    routes.post(
      '/documents',
      requireLibraryAction('create'),
      describeRoute({
        tags: [TAG],
        summary: 'Create a document owned by the caller',
        operationId: 'createLibraryDocument',
        responses: {
          '201': dataResponse(LibraryDocument, 'The created document.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateLibraryDocumentInput),
      async (context) => {
        const input = context.req.valid('json');
        const document = await library.create({
          authorization: context.get('authz'),
          title: input.title,
          body: input.body,
          published: input.published,
          confidential: input.confidential,
        });
        return context.json({ data: document }, 201);
      },
    );

    routes.patch(
      '/documents/:documentId',
      requireLibraryAction('edit'),
      describeRoute({
        tags: [TAG],
        summary: 'Change a document the caller owns',
        operationId: 'updateLibraryDocument',
        responses: {
          '200': dataResponse(LibraryDocument, 'The updated document.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', LibraryDocumentIdParams),
      apiValidator('json', UpdateLibraryDocumentInput),
      async (context) => {
        const { documentId } = context.req.valid('param');
        const input = context.req.valid('json');
        return context.json({
          data: await library.update({
            authorization: context.get('authz'),
            id: documentId,
            ...input,
          }),
        });
      },
    );

    routes.delete(
      '/documents/:documentId',
      requireLibraryAction('delete'),
      describeRoute({
        tags: [TAG],
        summary: 'Delete a document the caller owns',
        operationId: 'deleteLibraryDocument',
        responses: {
          '204': emptyResponse('The document was deleted.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', LibraryDocumentIdParams),
      async (context) => {
        const { documentId } = context.req.valid('param');
        await library.remove(context.get('authz'), documentId);
        return context.body(null, 204);
      },
    );

    router.route('/library', routes);
    return router;
  },
);
