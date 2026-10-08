import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
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
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type {
  AuthorizationContext,
  AuthorizationEnv,
} from '@nocobase/authorization/core';
import { Hono, type Context } from 'hono';

import {
  DOCUMENTS_COLLECTION,
  DOCUMENTS_RESOURCE,
  type Document,
} from '../library/resources.js';
import {
  libraryServiceToken,
  type DocumentPolicy,
} from '../library/service.js';
import {
  CreateDocumentInput,
  DocumentIdParam,
  DocumentListMeta,
  DocumentSchema,
  ListDocumentsQuery,
  UpdateDocumentInput,
  serializeDocument,
  type DocumentView,
} from './schemas.js';

const tags = ['Documents'];

/** The composite action names the resource declares, one per HTTP operation. */
type DocumentAction = 'view' | 'create' | 'edit' | 'delete';

/**
/**
 * The document library's HTTP surface, mounted at `/api/documents`.
 *
 * The authentication and authorization middleware sit on the inner router
 * mounted at `/documents`, so they are scoped to exactly these paths and never
 * leak into a contribution mounted alongside this one.
 *
 * Each operation names a composite action exactly once, takes the record
 * policy the decision produced, and binds it to the Repository. A decision
 * without a database policy is refused rather than widened: only the tables a
 * business operation composes may be reached, so a grant belonging to another
 * operation cannot leak records into this one.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const routes = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const library = app.container.resolve(libraryServiceToken);
    const database = app.container.resolve(databaseManagerToken);

    routes.use('*', authentication.required(), authorization.middleware());
    routes.onError((error, context) => apiErrorHandler(error, context));

    routes.get(
      '/',
      describeRoute({
        tags,
        summary: 'List the documents the caller may read',
        operationId: 'listDocuments',
        responses: {
          '200': listResponse(DocumentSchema, DocumentListMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListDocumentsQuery),
      async (context) => {
        const policy = await documentPolicy(context, 'view');
        const { items, total } = await library.list(
          policy,
          context.req.valid('query'),
        );
        return context.json({
          data: await decorateMany(database, items),
          meta: { total },
        });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags,
        summary: 'Create a document owned by the caller',
        operationId: 'createDocument',
        responses: {
          '201': dataResponse(DocumentSchema, 'The created document.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateDocumentInput),
      async (context) => {
        const policy = await documentPolicy(context, 'create');
        const ownerId = authorizationOf(context).identity.principal.id;
        const document = await library.create(
          policy,
          context.req.valid('json'),
          ownerId,
        );
        return context.json({ data: await decorate(database, document) }, 201);
      },
    );

    routes.get(
      '/:documentId',
      describeRoute({
        tags,
        summary: 'Get one document',
        operationId: 'getDocument',
        responses: {
          '200': dataResponse(DocumentSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocumentIdParam),
      async (context) => {
        const policy = await documentPolicy(context, 'view');
        const document = await library.get(
          policy,
          context.req.valid('param').documentId,
        );
        if (!document) {
          throw notFound();
        }
        return context.json({ data: await decorate(database, document) });
      },
    );

    routes.patch(
      '/:documentId',
      describeRoute({
        tags,
        summary: 'Update one document',
        operationId: 'updateDocument',
        responses: {
          '200': dataResponse(DocumentSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocumentIdParam),
      apiValidator('json', UpdateDocumentInput),
      async (context) => {
        const policy = await documentPolicy(context, 'edit');
        const document = await library.update(
          policy,
          context.req.valid('param').documentId,
          context.req.valid('json'),
        );
        return context.json({ data: await decorate(database, document) });
      },
    );

    routes.delete(
      '/:documentId',
      describeRoute({
        tags,
        summary: 'Delete one document',
        operationId: 'deleteDocument',
        responses: {
          '204': emptyResponse('The document was deleted.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocumentIdParam),
      async (context) => {
        const policy = await documentPolicy(context, 'delete');
        await library.remove(policy, context.req.valid('param').documentId);
        return context.body(null, 204);
      },
    );

    // Mounted at `/api/documents`: the paths above are relative to that prefix.
    router.route('/documents', routes);
    return router;
  },
);

/**
 * Asks the composite business operation once, then reads the record policy the
 * decision resolved for `documents`.
 *
 * A `deny`, or a `conditional` decision that named no policy for the table, is
 * refused with the standard permission error. The decision is never replaced
 * with an aggregate collection check: that would let a grant belonging to
 * another operation widen this one.
 */
async function documentPolicy(
  context: Context,
  action: DocumentAction,
): Promise<DocumentPolicy> {
  const decision = await authorizationOf(context).authorize({
    resource: { type: 'composite', id: DOCUMENTS_RESOURCE },
    action,
  });
  const policy = decision.conditions?.database?.[DOCUMENTS_COLLECTION];
  if (decision.effect === 'deny' || !policy) {
    throw new ApiError({
      status: 'PERMISSION_DENIED',
      reason: `DOCUMENT_${action.toUpperCase()}_DENIED`,
      domain: 'library',
      message: `Performing "${action}" on documents is not allowed.`,
    });
  }
  return policy;
}

/**
 * Reads the authorization context `authorization.middleware()` installed.
 * Hono does not carry the middleware's `Variables` into an untyped handler, so
 * the handler's context is widened to the environment that declares it.
 */
function authorizationOf(context: Context): AuthorizationContext {
  return (context as unknown as Context<AuthorizationEnv>).get('authz');
}

/** The standard 404, used when the policy hides a record the caller named. */
function notFound(): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'DOCUMENT_NOT_FOUND',
    domain: 'library',
    message: 'The document was not found.',
  });
}

/**
 * Adds the owner's display name for the rows the caller is already allowed to
 * see. The account collection is read unrestricted because this runs on the
 * server after authorization and only decorates records that passed it.
 */
async function decorate(
  database: DatabaseManager,
  document: Document,
): Promise<DocumentView> {
  const names = await ownerNames(database, [document.ownerId]);
  return serializeDocument(document, names.get(document.ownerId) ?? null);
}

async function decorateMany(
  database: DatabaseManager,
  documents: readonly Document[],
): Promise<readonly DocumentView[]> {
  const names = await ownerNames(
    database,
    documents.map((document) => document.ownerId),
  );
  return documents.map((document) =>
    serializeDocument(document, names.get(document.ownerId) ?? null),
  );
}

async function ownerNames(
  database: DatabaseManager,
  ownerIds: readonly string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ownerIds)];
  if (unique.length === 0) {
    return new Map();
  }
  const users = await database
    .repository<{ id: string; name: string }>('user')
    .findMany({
      filter: (filter) =>
        filter.or(unique.map((id) => filter.string('id').eq(id))),
    });
  return new Map(users.map((user) => [user.id, user.name]));
}
