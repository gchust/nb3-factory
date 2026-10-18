import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthSession,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationContext,
} from '@nocobase/app-plugin-authorization/server';
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
import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  DocumentForbiddenError,
  DocumentNotFoundError,
  type DocumentActor,
} from '../documents/service.js';
import { documentServiceToken } from '../providers/documents.js';
import {
  CreateDocumentInput,
  CreateDocumentShareInput,
  DocumentListMeta,
  DocumentParams,
  DocumentSchema,
  DocumentShareParams,
  DocumentShareSchema,
  UpdateDocumentInput,
} from './schemas.js';

const TAGS = ['Documents'];

/** Map the library's domain errors onto the standard API error body; anything else goes to the framework handler. */
function mapDomainError(error: unknown): unknown {
  if (error instanceof DocumentNotFoundError) {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'DOCUMENT_NOT_FOUND',
      domain: 'documents',
      message: error.message,
    });
  }
  if (error instanceof DocumentForbiddenError) {
    return new ApiError({
      status: 'PERMISSION_DENIED',
      reason: 'DOCUMENT_FORBIDDEN',
      domain: 'documents',
      message: error.message,
    });
  }
  return error;
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const documents = app.container.resolve(documentServiceToken);

    router.onError((error, context) =>
      apiErrorHandler(mapDomainError(error), context),
    );

    // Scoped to the paths this route owns, so the guard never leaks into another contribution mounted at `/api`.
    for (const path of ['/documents', '/documents/*']) {
      router.use(path, auth.required());
      router.use(path, authorization.middleware());
    }

    const actorFor = async (context: Context): Promise<DocumentActor> => {
      // Both variables are set by the middleware above: `auth` by the authentication plugin, `authz` by the
      // authorization middleware. `Hono`'s generic environment cannot name them across the two plugins here, so the
      // values are narrowed by the plugin types rather than left as `any`.
      const session = context.get('auth') as AuthSession | null | undefined;
      const authz = context.get('authz') as AuthorizationContext | undefined;
      const user = session?.user;
      if (!user || !authz) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'AUTHENTICATION_REQUIRED',
          domain: 'documents',
          message: 'Sign in to use the document library.',
        });
      }
      const identity = authz.identity;
      const effective = await authorization.permissionSets.getEffective({
        principal: identity.principal,
        subjects: identity.subjects,
      });
      return {
        userId: String(user.id),
        userName: String(user.name ?? ''),
        unrestricted: (await authz.snapshot()).unrestricted,
        permissionSets: effective.map((set) => set.key),
      };
    };

    router.get(
      '/documents',
      describeRoute({
        tags: TAGS,
        summary: 'List the documents the signed-in user may read',
        operationId: 'documentsList',
        description:
          'A published non-confidential document is listed for every signed-in colleague. A draft appears only for its owner and for whoever an administrator shared it with; a confidential document only for its owner.',
        responses: {
          200: listResponse(DocumentSchema, DocumentListMeta),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      async (context) => {
        const actor = await actorFor(context);
        const data = await documents.list(actor);
        return context.json({
          data,
          meta: { total: data.length, canCreate: documents.canCreate(actor) },
        });
      },
    );

    router.post(
      '/documents',
      describeRoute({
        tags: TAGS,
        summary: 'Create a document',
        operationId: 'documentsCreate',
        description:
          'Requires the document-editor permission. The new document belongs to the caller.',
        responses: {
          201: dataResponse(DocumentSchema, 'The created document.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateDocumentInput),
      async (context) => {
        const actor = await actorFor(context);
        const document = await documents.create(
          actor,
          context.req.valid('json'),
        );
        return context.json({ data: document }, 201);
      },
    );

    router.get(
      '/documents/:documentId',
      describeRoute({
        tags: TAGS,
        summary: 'Read one document',
        operationId: 'documentsGet',
        description:
          'A document the caller may not read is answered as not found, so the library does not reveal that it exists.',
        responses: {
          200: dataResponse(DocumentSchema),
          401: apiErrorResponse(401),
          404: apiErrorResponse(404),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) =>
        context.json({
          data: await documents.get(
            await actorFor(context),
            context.req.valid('param').documentId,
          ),
        }),
    );

    router.patch(
      '/documents/:documentId',
      describeRoute({
        tags: TAGS,
        summary: 'Update one document',
        operationId: 'documentsUpdate',
        description:
          'Only the owner (holding the document-editor permission) or an administrator may update a document.',
        responses: {
          200: dataResponse(DocumentSchema, 'The updated document.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocumentParams),
      apiValidator('json', UpdateDocumentInput),
      async (context) =>
        context.json({
          data: await documents.update(
            await actorFor(context),
            context.req.valid('param').documentId,
            context.req.valid('json'),
          ),
        }),
    );

    router.delete(
      '/documents/:documentId',
      describeRoute({
        tags: TAGS,
        summary: 'Delete one document',
        operationId: 'documentsDelete',
        description:
          'Only the owner (holding the document-editor permission) or an administrator may delete a document. Its shares go with it.',
        responses: {
          204: emptyResponse('The document is gone.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        await documents.remove(
          await actorFor(context),
          context.req.valid('param').documentId,
        );
        return context.body(null, 204);
      },
    );

    router.get(
      '/documents/:documentId/shares',
      describeRoute({
        tags: TAGS,
        summary: 'List who one draft is shared with',
        operationId: 'documentsListShares',
        description: 'Administrators only.',
        responses: {
          200: listResponse(DocumentShareSchema, DocumentListMeta),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        const data = await documents.listShares(
          await actorFor(context),
          context.req.valid('param').documentId,
        );
        return context.json({
          data,
          meta: { total: data.length, canCreate: false },
        });
      },
    );

    router.post(
      '/documents/:documentId/shares',
      describeRoute({
        tags: TAGS,
        summary: 'Temporarily share one draft with a user',
        operationId: 'documentsCreateShare',
        description:
          'Administrators only. Sharing a confidential document has no effect: confidentiality hides it from everyone but its owner regardless of the share.',
        responses: {
          201: dataResponse(DocumentShareSchema, 'The share.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocumentParams),
      apiValidator('json', CreateDocumentShareInput),
      async (context) => {
        const share = await documents.share(
          await actorFor(context),
          context.req.valid('param').documentId,
          context.req.valid('json').userId,
        );
        return context.json({ data: share }, 201);
      },
    );

    router.delete(
      '/documents/:documentId/shares/:userId',
      describeRoute({
        tags: TAGS,
        summary: 'Revoke a share',
        operationId: 'documentsRevokeShare',
        description:
          'Administrators only. After the revoke the shared draft is no longer readable by that user.',
        responses: {
          204: emptyResponse('The share is gone.'),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocumentShareParams),
      async (context) => {
        const params = context.req.valid('param');
        await documents.revokeShare(
          await actorFor(context),
          params.documentId,
          params.userId,
        );
        return context.body(null, 204);
      },
    );

    return router;
  },
);
