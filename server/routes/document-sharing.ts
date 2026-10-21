import { authenticationToken } from '@nocobase/app-plugin-authentication';
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
  emptyResponse,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import { DOCUMENTS_SHARING_SETTINGS } from '../documents/constants.js';
import { documentsServiceToken } from '../documents/tokens.js';

type DocumentsContext = {
  get(key: 'authz'): AuthorizationContext;
};

function authorizationContext(context: unknown): AuthorizationContext {
  return (context as DocumentsContext).get('authz');
}

const tags = ['Document sharing'];

const DocumentShareSchema = z.object({
  userId: z.string(),
  name: z.string(),
  username: z.string().nullable(),
});

const AdminDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
  published: z.boolean(),
  confidential: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  shares: z.array(DocumentShareSchema),
});

const RecipientSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string().nullable(),
  email: z.string(),
});

const DocumentParams = z.object({
  documentId: z.string().min(1).max(36),
});

const ShareParams = z.object({
  documentId: z.string().min(1).max(36),
  userId: z.string().min(1).max(64),
});

function allowed(action: 'read' | 'create' | 'delete') {
  return createMiddleware(async (context, next) => {
    await authorizationContext(context).require({
      resource: { type: 'settings', id: DOCUMENTS_SHARING_SETTINGS },
      action,
    });
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
    '/documentSharing',
    authentication.required(),
    authorization.middleware(),
  );
  routes.use(
    '/documentSharing/*',
    authentication.required(),
    authorization.middleware(),
  );

  routes.get(
    '/documentSharing/documents',
    allowed('read'),
    describeRoute({
      tags,
      summary: 'List documents with their temporary readers',
      operationId: 'documentSharingListDocuments',
      responses: {
        200: dataResponse(z.array(AdminDocumentSchema)),
        ...apiErrorResponses,
        403: apiErrorResponse(
          403,
          'The caller may not administer document sharing.',
        ),
      },
    }),
    async (context) => {
      const data = await documents.adminDocuments();
      return context.json({ data });
    },
  );

  routes.get(
    '/documentSharing/recipients',
    allowed('read'),
    describeRoute({
      tags,
      summary: 'List enabled people a document can be shared with',
      operationId: 'documentSharingListRecipients',
      responses: {
        200: dataResponse(z.array(RecipientSchema)),
        ...apiErrorResponses,
        403: apiErrorResponse(
          403,
          'The caller may not administer document sharing.',
        ),
      },
    }),
    async (context) => {
      const data = await documents.recipients();
      return context.json({ data });
    },
  );

  routes.post(
    '/documentSharing/shares/:documentId',
    allowed('create'),
    describeRoute({
      tags,
      summary: 'Temporarily open one document to one person',
      operationId: 'documentSharingCreateShare',
      responses: {
        200: dataResponse(DocumentShareSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'The document is confidential (`CONFIDENTIAL_DOCUMENT`) or the recipient is disabled (`RECIPIENT_DISABLED`).',
        ),
        403: apiErrorResponse(
          403,
          'The caller may not administer document sharing.',
        ),
        404: apiErrorResponse(
          404,
          'The document (`DOCUMENT_NOT_FOUND`) or recipient (`RECIPIENT_NOT_FOUND`) does not exist.',
        ),
      },
    }),
    apiValidator('param', DocumentParams),
    apiValidator('json', z.object({ userId: z.string().min(1).max(64) })),
    async (context) => {
      const { documentId } = context.req.valid('param');
      const { userId } = context.req.valid('json');
      return context.json({ data: await documents.share(documentId, userId) });
    },
  );

  routes.delete(
    '/documentSharing/shares/:documentId/:userId',
    allowed('delete'),
    describeRoute({
      tags,
      summary: 'Revoke a temporary document share',
      operationId: 'documentSharingDeleteShare',
      responses: {
        204: emptyResponse('The share was revoked.'),
        ...apiErrorResponses,
        403: apiErrorResponse(
          403,
          'The caller may not administer document sharing.',
        ),
        404: apiErrorResponse(
          404,
          'The document does not exist (`DOCUMENT_NOT_FOUND`).',
        ),
      },
    }),
    apiValidator('param', ShareParams),
    async (context) => {
      const { documentId, userId } = context.req.valid('param');
      await documents.unshare(documentId, userId);
      return context.body(null, 204);
    },
  );

  return routes;
});

const routes = [apiRoutes];

export default routes;
