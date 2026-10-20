import type { AuthSession } from '@nocobase/app-plugin-authentication/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import type { AuthorizationContext } from '@nocobase/authorization';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import type {
  DocumentRecord,
  DocumentShareRecord,
} from '../providers/document-types.js';
import { documentServiceToken } from '../providers/documents-provider.js';
import {
  CandidateListMeta,
  CreateDocumentInput,
  CreateShareInput,
  DocumentListMeta,
  DocumentParams,
  DocumentSchema,
  DocumentShareSchema,
  ShareCandidateSchema,
  ShareListMeta,
  ShareParams,
  UpdateDocumentInput,
} from './document-schemas.js';

const tags = ['Documents'];
const RESOURCE = { type: 'composite', id: 'documents.library' } as const;
const ALL = { read: true, create: true, update: true, delete: true } as const;

type AppContext = Context<{
  Variables: { auth: AuthSession; authz: AuthorizationContext };
}>;

interface Policies {
  documents: RepositoryPolicy<DocumentRecord>;
  documentShares: RepositoryPolicy<DocumentShareRecord>;
}

function authOf(context: Context): AuthSession {
  return (context as AppContext).get('auth');
}

function authzOf(context: Context): AuthorizationContext {
  return (context as AppContext).get('authz');
}

function denied(action: string): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'DOCUMENT_PERMISSION_DENIED',
    domain: 'documents',
    message: `The ${action} document action is not allowed.`,
  });
}

function actor(auth: NonNullable<AuthSession>): {
  id: string;
  name: string;
} {
  return {
    id: auth.user.id,
    name: auth.user.name || auth.user.email || auth.user.id,
  };
}

/**
 * Resolves the repository policies once for the requested business action.
 * Unrestricted access produces no conditions, which is the one case where the
 * service receives an all-operations policy; scoped access always comes from
 * the authorization result and is never widened here.
 */
async function policiesFor(
  context: Context,
  action: 'view' | 'create' | 'edit' | 'share',
): Promise<Policies> {
  const decision = await authzOf(context).authorize({
    resource: RESOURCE,
    action,
  });
  if (decision.effect === 'deny') throw denied(action);
  const database = decision.conditions?.database;
  if (!database) {
    if (decision.effect === 'permit') {
      return { documents: ALL, documentShares: ALL };
    }
    throw denied(action);
  }
  const documents = database.documents;
  if (!documents) throw denied(action);
  const documentShares = database.documentShares;
  if (action === 'share' && !documentShares) throw denied(action);
  return { documents, documentShares: documentShares ?? ALL };
}

export const apiRoutes = defineApiRoutes<Application>(({ container }) => {
  const router = new Hono();
  const documents = new Hono();
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const service = container.resolve(documentServiceToken);

  documents.onError((error, context) => apiErrorHandler(error, context));
  documents.use('*', authentication.required(), authorization.middleware());

  documents.get(
    '/',
    describeRoute({
      tags,
      summary: 'List visible documents',
      operationId: 'documentsList',
      description:
        'Published non-confidential documents, the caller’s own documents, and documents temporarily shared with the caller.',
      responses: {
        200: listResponse(DocumentSchema, DocumentListMeta),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const policies = await policiesFor(context, 'view');
      const items = await service.list(policies.documents);
      return context.json({ data: items, meta: { total: items.length } });
    },
  );

  documents.get(
    '/share-candidates',
    describeRoute({
      tags,
      summary: 'List people a document can be shared with',
      operationId: 'documentsListShareCandidates',
      description:
        'Enabled people, available to a holder of the `share` action. Service accounts are excluded.',
      responses: {
        200: listResponse(ShareCandidateSchema, CandidateListMeta),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      await policiesFor(context, 'share');
      const items = await service.shareCandidates();
      return context.json({ data: items, meta: { total: items.length } });
    },
  );

  documents.post(
    '/',
    describeRoute({
      tags,
      summary: 'Create a document',
      operationId: 'documentsCreate',
      description:
        'Creates a document owned by the signed-in person. `published` controls ordinary visibility; `confidential` keeps it away from every non-owner.',
      responses: {
        201: {
          ...dataResponse(DocumentSchema, 'The created document.'),
          description: 'The created document.',
        },
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', CreateDocumentInput),
    async (context) => {
      const auth = authOf(context);
      if (!auth) throw new Error('Authentication middleware did not run.');
      const policies = await policiesFor(context, 'create');
      const created = await service.create(
        context.req.valid('json'),
        actor(auth),
        policies.documents,
      );
      context.status(201);
      return context.json({ data: created });
    },
  );

  documents.get(
    '/:documentId',
    describeRoute({
      tags,
      summary: 'Get a visible document',
      operationId: 'documentsGet',
      description:
        'Returns a document the caller may read. A document outside that selection is reported as not found, so its existence is not disclosed.',
      responses: {
        200: dataResponse(DocumentSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', DocumentParams),
    async (context) => {
      const policies = await policiesFor(context, 'view');
      const { documentId } = context.req.valid('param');
      return context.json({
        data: await service.get(documentId, policies.documents),
      });
    },
  );

  documents.patch(
    '/:documentId',
    describeRoute({
      tags,
      summary: 'Update a document',
      operationId: 'documentsUpdate',
      description:
        'Updates a document the caller may maintain, including its published and confidential flags.',
      responses: {
        200: dataResponse(DocumentSchema, 'The updated document.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', DocumentParams),
    apiValidator('json', UpdateDocumentInput),
    async (context) => {
      const policies = await policiesFor(context, 'edit');
      const { documentId } = context.req.valid('param');
      return context.json({
        data: await service.update(
          documentId,
          context.req.valid('json'),
          policies.documents,
        ),
      });
    },
  );

  documents.get(
    '/:documentId/shares',
    describeRoute({
      tags,
      summary: 'List temporary shares of a document',
      operationId: 'documentsListShares',
      description:
        'Lists share history for a document the caller may share. Only active, unexpired rows grant reading.',
      responses: {
        200: listResponse(DocumentShareSchema, ShareListMeta),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', DocumentParams),
    async (context) => {
      const policies = await policiesFor(context, 'share');
      const { documentId } = context.req.valid('param');
      const items = await service.shares(
        documentId,
        policies.documents,
        policies.documentShares,
      );
      return context.json({ data: items, meta: { total: items.length } });
    },
  );

  documents.post(
    '/:documentId/shares',
    describeRoute({
      tags,
      summary: 'Open one document to one person',
      operationId: 'documentsCreateShare',
      description:
        'Grants read access to one document, never edit access and never any other document. A confidential document cannot be shared.',
      responses: {
        201: {
          ...dataResponse(DocumentShareSchema, 'The active share.'),
          description: 'The active share.',
        },
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', DocumentParams),
    apiValidator('json', CreateShareInput),
    async (context) => {
      const auth = authOf(context);
      if (!auth) throw new Error('Authentication middleware did not run.');
      const policies = await policiesFor(context, 'share');
      const { documentId } = context.req.valid('param');
      const input = context.req.valid('json');
      const created = await service.share(
        documentId,
        { userId: input.userId, expiresAt: input.expiresAt ?? null },
        actor(auth),
        policies.documents,
        policies.documentShares,
      );
      context.status(201);
      return context.json({ data: created });
    },
  );

  documents.delete(
    '/:documentId/shares/:shareId',
    describeRoute({
      tags,
      summary: 'Revoke a temporary share',
      operationId: 'documentsRevokeShare',
      description:
        'Marks a share revoked. Every later read request re-evaluates access and no longer sees the document.',
      responses: {
        200: dataResponse(DocumentShareSchema, 'The revoked share.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', ShareParams),
    async (context) => {
      const policies = await policiesFor(context, 'share');
      const { documentId, shareId } = context.req.valid('param');
      return context.json({
        data: await service.revoke(
          documentId,
          shareId,
          policies.documents,
          policies.documentShares,
        ),
      });
    },
  );

  router.route('/documents', documents);
  return router;
});

export default apiRoutes;
