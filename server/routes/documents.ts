import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization/server';
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
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { LibraryError } from '../library/service.js';
import { libraryServiceToken } from '../library/tokens.js';
import type { DocumentRequester } from '../library/types.js';
import {
  AddDocumentShareInput,
  CreateDocumentInput,
  DocumentParams,
  DocumentShareParams,
  LibraryDocumentSchema,
  LibraryDocumentShareSchema,
  UpdateDocumentInput,
} from './schemas.js';

/** Both middlewares run on this router, so a handler reads the session and the request's authorization context. */
type LibraryEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

const tags = ['Documents'];
const documentNotFound = apiErrorResponse(
  404,
  'No such document, or the requester may not see it (`DOCUMENT_NOT_FOUND`). A hidden document is not distinguishable from a missing one.',
);
const confidentialShare = apiErrorResponse(
  400,
  'A confidential document cannot be shared with anyone but its owner (`CONFIDENTIAL_DOCUMENT`).',
);

function toLibraryApiError(error: unknown): ApiError | undefined {
  if (!(error instanceof LibraryError)) return undefined;
  switch (error.code) {
    case 'DOCUMENT_NOT_FOUND':
      return new ApiError({
        status: 'NOT_FOUND',
        reason: error.code,
        domain: 'library',
        message: error.message,
      });
    case 'NOT_DOCUMENT_OWNER':
      return new ApiError({
        status: 'PERMISSION_DENIED',
        reason: error.code,
        domain: 'library',
        message: error.message,
      });
    case 'CONFIDENTIAL_DOCUMENT':
      return new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: error.code,
        domain: 'library',
        message: error.message,
      });
    case 'USER_NOT_FOUND':
      return new ApiError({
        status: 'NOT_FOUND',
        reason: error.code,
        domain: 'library',
        message: error.message,
      });
  }
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const library = app.container.resolve(libraryServiceToken);

    const api = new Hono();
    api.onError((error, context) =>
      apiErrorHandler(toLibraryApiError(error) ?? error, context),
    );

    const documents = new Hono<LibraryEnv>();
    documents.use('*', authentication.required(), authorization.middleware());

    const requester = async (
      context: Context<LibraryEnv>,
    ): Promise<DocumentRequester> => {
      const auth = context.get('auth');
      if (!auth) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain: 'library',
          message: 'A signed-in session is required.',
        });
      }
      const snapshot = await context.get('authz').snapshot();
      return { userId: auth.user.id, unrestricted: snapshot.unrestricted };
    };

    documents.get(
      '/',
      describeRoute({
        tags,
        summary: 'List the documents the requester may read',
        operationId: 'libraryListDocuments',
        description:
          'The owner sees every document they own; everyone else sees published documents that are not confidential, plus the drafts currently shared with them. A confidential document is only ever visible to its owner.',
        responses: {
          200: dataResponse(z.array(LibraryDocumentSchema)),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await context.get('authz').require({
          resource: { type: 'library.document', id: '*' },
          action: 'read',
        });
        return context.json({
          data: await library.list(await requester(context)),
        });
      },
    );

    documents.post(
      '/',
      describeRoute({
        tags,
        summary: 'Create a document',
        operationId: 'libraryCreateDocument',
        description: 'The document is owned by the requester.',
        responses: {
          201: dataResponse(LibraryDocumentSchema, 'Created'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateDocumentInput),
      async (context) => {
        await context.get('authz').require({
          resource: { type: 'library.document', id: '*' },
          action: 'create',
        });
        const input = context.req.valid('json');
        return context.json(
          { data: await library.create(await requester(context), input) },
          201,
        );
      },
    );

    documents.get(
      '/:documentId',
      describeRoute({
        tags,
        summary: 'Read one document',
        operationId: 'libraryGetDocument',
        responses: {
          200: dataResponse(LibraryDocumentSchema),
          ...apiErrorResponses,
          404: documentNotFound,
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        await context.get('authz').require({
          resource: { type: 'library.document', id: '*' },
          action: 'read',
        });
        const document = await library.get(
          await requester(context),
          context.req.valid('param').documentId,
        );
        if (!document) {
          throw new LibraryError('DOCUMENT_NOT_FOUND', 'Unknown document.');
        }
        return context.json({ data: document });
      },
    );

    documents.patch(
      '/:documentId',
      describeRoute({
        tags,
        summary: 'Change one document',
        operationId: 'libraryUpdateDocument',
        description:
          'Only the owner may change a document; reading is never editing.',
        responses: {
          200: dataResponse(LibraryDocumentSchema),
          ...apiErrorResponses,
          404: documentNotFound,
        },
      }),
      apiValidator('param', DocumentParams),
      apiValidator('json', UpdateDocumentInput),
      async (context) => {
        await context.get('authz').require({
          resource: { type: 'library.document', id: '*' },
          action: 'update',
        });
        return context.json({
          data: await library.update(
            await requester(context),
            context.req.valid('param').documentId,
            context.req.valid('json'),
          ),
        });
      },
    );

    documents.delete(
      '/:documentId',
      describeRoute({
        tags,
        summary: 'Delete one document',
        operationId: 'libraryDeleteDocument',
        description:
          'Only the owner may delete a document. Its shares are removed with it.',
        responses: {
          204: emptyResponse('Deleted'),
          ...apiErrorResponses,
          404: documentNotFound,
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        await context.get('authz').require({
          resource: { type: 'library.document', id: '*' },
          action: 'delete',
        });
        await library.remove(
          await requester(context),
          context.req.valid('param').documentId,
        );
        return context.body(null, 204);
      },
    );

    documents.get(
      '/:documentId/shares',
      describeRoute({
        tags,
        summary: 'List who a document is shared with',
        operationId: 'libraryListDocumentShares',
        responses: {
          200: dataResponse(z.array(LibraryDocumentShareSchema)),
          ...apiErrorResponses,
          404: documentNotFound,
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        await context.get('authz').require({
          resource: { type: 'library.document', id: '*' },
          action: 'share',
        });
        return context.json({
          data: await library.listShares(context.req.valid('param').documentId),
        });
      },
    );

    documents.post(
      '/:documentId/shares',
      describeRoute({
        tags,
        summary: 'Share one document with one person',
        operationId: 'libraryAddDocumentShare',
        description:
          'Opens a draft to one person, revocable by deleting the share. A confidential document cannot be shared.',
        responses: {
          201: dataResponse(LibraryDocumentShareSchema, 'Shared'),
          ...apiErrorResponses,
          400: confidentialShare,
          404: documentNotFound,
        },
      }),
      apiValidator('param', DocumentParams),
      apiValidator('json', AddDocumentShareInput),
      async (context) => {
        await context.get('authz').require({
          resource: { type: 'library.document', id: '*' },
          action: 'share',
        });
        const share = await library.addShare(
          await requester(context),
          context.req.valid('param').documentId,
          context.req.valid('json').userId,
        );
        return context.json({ data: share }, 201);
      },
    );

    documents.delete(
      '/:documentId/shares/:userId',
      describeRoute({
        tags,
        summary: 'Revoke one document share',
        operationId: 'libraryRemoveDocumentShare',
        description:
          'Revoking a share that is not there leaves the document as it was.',
        responses: {
          204: emptyResponse('Revoked'),
          ...apiErrorResponses,
          404: documentNotFound,
        },
      }),
      apiValidator('param', DocumentShareParams),
      async (context) => {
        await context.get('authz').require({
          resource: { type: 'library.document', id: '*' },
          action: 'share',
        });
        const params = context.req.valid('param');
        await library.removeShare(params.documentId, params.userId);
        return context.body(null, 204);
      },
    );

    api.route('/documents', documents);
    return api;
  },
);

export default apiRoutes;
