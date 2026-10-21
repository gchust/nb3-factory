import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import {
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import {
  DOCUMENTS_COLLECTION,
  DOCUMENTS_RESOURCE,
  type DocumentsAction,
} from '../documents/constants.js';
import { documentsServiceToken } from '../documents/tokens.js';
import { accessDenied } from '../services/documents-service.js';

type DocumentsContext = {
  get(key: 'authz'): AuthorizationContext;
  get(key: 'auth'): AuthEnv['Variables']['auth'];
};

function authorizationContext(context: unknown): AuthorizationContext {
  return (context as DocumentsContext).get('authz');
}

function currentUser(context: unknown): AuthEnv['Variables']['auth'] {
  return (context as DocumentsContext).get('auth');
}

const tags = ['Documents'];

const DocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
  published: z.boolean(),
  confidential: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canEdit: z.boolean(),
});

const DocumentListMeta = z.object({ canCreate: z.boolean() });

const DocumentParams = z.object({
  documentId: z.string().min(1).max(36),
});

const CreateDocumentInput = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1),
  published: z.boolean().default(false),
  confidential: z.boolean().default(false),
});

const UpdateDocumentInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  published: z.boolean().optional(),
  confidential: z.boolean().optional(),
});

async function assertDocumentAction(
  context: AuthorizationContext,
  action: DocumentsAction,
): Promise<void> {
  const decision = await context.authorize({
    resource: { type: 'composite', id: DOCUMENTS_RESOURCE },
    action,
  });
  if (
    decision.effect === 'deny' ||
    !decision.conditions?.database?.[DOCUMENTS_COLLECTION]
  ) {
    throw accessDenied();
  }
}

/** Check the business action before input validation, so a denial reveals nothing about valid input. */
function allowed(action: DocumentsAction) {
  return createMiddleware(async (context, next) => {
    await assertDocumentAction(authorizationContext(context), action);
    await next();
  });
}

export const apiRoutes = defineApiRoutes<Application>(({ container }) => {
  const routes = new Hono();
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const documents = container.resolve(documentsServiceToken);

  routes.onError((error, context) => apiErrorHandler(error, context));
  // Scope the guard to this feature's paths: the contribution is mounted at the
  // API root, and a wildcard would authenticate every application route.
  routes.use(
    '/documents',
    authentication.required(),
    authorization.middleware(),
  );
  routes.use(
    '/documents/*',
    authentication.required(),
    authorization.middleware(),
  );

  routes.get(
    '/documents',
    allowed('view'),
    describeRoute({
      tags,
      summary: 'List the documents the caller may read',
      operationId: 'documentsList',
      responses: {
        200: listResponse(DocumentSchema, DocumentListMeta),
        ...apiErrorResponses,
        403: apiErrorResponse(
          403,
          'The caller has no document-reading permission (`DOCUMENTS_ACCESS_DENIED`).',
        ),
      },
    }),
    async (context) => {
      const result = await documents.list(authorizationContext(context));
      return context.json({
        data: result.items,
        meta: { total: result.items.length, canCreate: result.canCreate },
      });
    },
  );

  routes.get(
    '/documents/:documentId',
    allowed('view'),
    describeRoute({
      tags,
      summary: 'Read one document',
      operationId: 'documentsGet',
      responses: {
        200: dataResponse(DocumentSchema),
        ...apiErrorResponses,
        403: apiErrorResponse(
          403,
          'The caller has no document-reading permission (`DOCUMENTS_ACCESS_DENIED`).',
        ),
        404: apiErrorResponse(
          404,
          "The document does not exist or is outside the caller's data scope (`DOCUMENT_NOT_FOUND`).",
        ),
      },
    }),
    apiValidator('param', DocumentParams),
    async (context) => {
      const { documentId } = context.req.valid('param');
      return context.json({
        data: await documents.get(authorizationContext(context), documentId),
      });
    },
  );

  routes.post(
    '/documents',
    allowed('create'),
    describeRoute({
      tags,
      summary: 'Create a document owned by the caller',
      operationId: 'documentsCreate',
      responses: {
        201: dataResponse(DocumentSchema),
        ...apiErrorResponses,
        403: apiErrorResponse(
          403,
          'The caller may not create documents (`DOCUMENTS_ACCESS_DENIED`).',
        ),
      },
    }),
    apiValidator('json', CreateDocumentInput),
    async (context) => {
      const input = context.req.valid('json');
      const ownerId = currentUser(context)!.user.id;
      const document = await documents.create(
        authorizationContext(context),
        ownerId,
        input,
      );
      return context.json({ data: document }, 201);
    },
  );

  routes.patch(
    '/documents/:documentId',
    allowed('edit'),
    describeRoute({
      tags,
      summary: 'Edit a document the caller owns',
      operationId: 'documentsUpdate',
      responses: {
        200: dataResponse(DocumentSchema),
        ...apiErrorResponses,
        403: apiErrorResponse(
          403,
          'The caller may not edit this document (`DOCUMENTS_ACCESS_DENIED`).',
        ),
        404: apiErrorResponse(
          404,
          "The document does not exist or is outside the caller's data scope (`DOCUMENT_NOT_FOUND`).",
        ),
      },
    }),
    apiValidator('param', DocumentParams),
    apiValidator('json', UpdateDocumentInput),
    async (context) => {
      const { documentId } = context.req.valid('param');
      const input = context.req.valid('json');
      return context.json({
        data: await documents.update(
          authorizationContext(context),
          documentId,
          input,
        ),
      });
    },
  );

  return routes;
});

const routes = [apiRoutes];

export default routes;
