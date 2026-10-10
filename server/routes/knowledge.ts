import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { knowledgeServiceToken } from '../knowledge-service.js';
import {
  DocumentParams,
  DocumentSchema,
  UpdateDocumentInput,
} from './schemas.js';

const tags = ['Knowledge'];
const domain = 'knowledge';

/**
 * Read and edit endpoints for the internal document library.
 *
 * Every route authorizes the same composite the UI and the assistant check, so
 * a document a colleague cannot open is a document this API will not return —
 * the record scope is applied by the Repository Policy, not by filtering after
 * the fact. The edit route is the only write path in the feature and it can
 * change nothing but a document's title and body.
 */
export const apiRoutes = defineApiRoutes((app: Application) => {
  const { container } = app;
  const router = new Hono();
  const routes = new Hono<AuthorizationEnv>();
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const knowledge = container.resolve(knowledgeServiceToken);

  routes.use('*', authentication.required(), authorization.middleware());

  routes.get(
    '/documents',
    describeRoute({
      tags,
      summary: 'List the documents the caller may read',
      operationId: 'knowledgeListDocuments',
      description:
        'Returns only the documents the signed-in identity may read; a restricted document is absent for anyone without the manage grant.',
      responses: {
        200: listResponse(DocumentSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      const documents = await knowledge.listDocuments(context.get('authz'));
      return context.json({
        data: documents.map(toDto),
        meta: { total: documents.length },
      });
    },
  );

  routes.get(
    '/documents/:documentId',
    describeRoute({
      tags,
      summary: 'Read one document',
      operationId: 'knowledgeGetDocument',
      description:
        'Reads one document the caller may read. A document that exists but is out of scope is answered `404`, the same as one that does not exist.',
      responses: {
        200: dataResponse(DocumentSchema),
        404: apiErrorResponse(
          404,
          'No such document, or it is not visible to the caller (`KNOWLEDGE_DOCUMENT_NOT_FOUND`).',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', DocumentParams),
    async (context) => {
      const { documentId } = context.req.valid('param');
      const document = await knowledge.getDocument(
        context.get('authz'),
        documentId,
      );
      if (!document) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'KNOWLEDGE_DOCUMENT_NOT_FOUND',
          domain,
          message: `Document ${documentId} was not found.`,
        });
      }
      return context.json({ data: toDto(document) });
    },
  );

  routes.patch(
    '/documents/:documentId',
    describeRoute({
      tags,
      summary: 'Update a document title or body',
      operationId: 'knowledgeUpdateDocument',
      description:
        "Updates a document the caller may manage. Only `title` and `body` can change; `visibility` and the timestamps stay under the server's control. Requires the `manage` grant on `knowledge.documents`.",
      responses: {
        200: dataResponse(DocumentSchema),
        400: apiErrorResponse(
          400,
          'Neither `title` nor `body` was supplied (`KNOWLEDGE_EMPTY_UPDATE`).',
        ),
        404: apiErrorResponse(
          404,
          'No such document, or it is not visible to the caller (`KNOWLEDGE_DOCUMENT_NOT_FOUND`).',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', DocumentParams),
    apiValidator('json', UpdateDocumentInput),
    async (context) => {
      const { documentId } = context.req.valid('param');
      const input = context.req.valid('json');
      if (input.title === undefined && input.body === undefined) {
        throw new ApiError({
          status: 'INVALID_ARGUMENT',
          reason: 'KNOWLEDGE_EMPTY_UPDATE',
          domain,
          message: 'Supply at least one of title or body.',
        });
      }
      const document = await knowledge.updateDocument(
        context.get('authz'),
        documentId,
        input,
      );
      if (!document) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'KNOWLEDGE_DOCUMENT_NOT_FOUND',
          domain,
          message: `Document ${documentId} was not found.`,
        });
      }
      return context.json({ data: toDto(document) });
    },
  );

  // Mounted on its own sub-router so the `use('*', ...)` middleware above is
  // scoped to exactly this feature's paths.
  router.route('/knowledge', routes);
  return router;
});

const toDto = (document: {
  id: number;
  title: string;
  body: string;
  visibility: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}) => ({
  id: document.id,
  title: document.title,
  body: document.body,
  visibility: document.visibility as 'public' | 'restricted',
  createdAt: new Date(document.createdAt).toISOString(),
  updatedAt: new Date(document.updatedAt).toISOString(),
});
