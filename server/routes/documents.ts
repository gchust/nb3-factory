import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
  emptyResponse,
  listResponse,
} from '@nocobase/app-server/router';
import type { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';

import {
  documentCenterServiceToken,
  DOCUMENT_CENTER_SETTINGS_ID,
  type DocumentCenterService,
} from '../providers/document-center.js';
import {
  AskInput,
  CreateDocumentInput,
  DocumentDetailSchema,
  DocumentPageMetaSchema,
  DocumentParams,
  DocumentSummarySchema,
  DocumentVersionParams,
  DocumentVersionSchema,
  ListDocumentsQuery,
  RestoreVersionInput,
  UpdateDocumentInput,
  AnswerSchema,
} from './schemas.js';
import {
  documentCenterErrorHandler,
  requireManage,
  type DocumentCenterEnv,
} from './shared.js';

const tags = ['Document Center'];

/**
 * The Document Center routes that serve the employee page and, on the admin
 * console, the document lifecycle. Everything here requires a session; the
 * mutating routes additionally require the `manage` action, checked per route
 * because the read routes share the same prefix.
 */
export function createDocumentsRouter(
  container: ServiceContainer,
): Hono<DocumentCenterEnv> {
  const router = new Hono<DocumentCenterEnv>();
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const documents = container.resolve<DocumentCenterService>(
    documentCenterServiceToken,
  );

  router.onError(documentCenterErrorHandler);
  router.use('*', authentication.required(), authorization.middleware());

  router.get(
    '/',
    describeRoute({
      tags,
      summary: 'List documents',
      operationId: 'documentCenterListDocuments',
      description:
        'A regular member sees only published documents their departments may read. An administrator additionally sees drafts and, with `deleted`, deleted documents.',
      responses: {
        200: listResponse(DocumentSummarySchema, DocumentPageMetaSchema),
        401: apiErrorResponse(401),
        500: apiErrorResponse(500),
      },
    }),
    apiValidator('query', ListDocumentsQuery),
    async (context) => {
      const query = context.req.valid('query');
      const actorId = context.get('authz').identity.principal.id;
      const actorCanManage = await context.get('authz').can({
        resource: { type: 'settings', id: DOCUMENT_CENTER_SETTINGS_ID },
        action: 'manage',
      });
      const page = await documents.listDocuments({
        actorId,
        actorCanManage,
        search: query.q,
        category: query.category,
        deleted: query.deleted,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      });
      return context.json({
        data: page.items,
        meta: { page: page.page, pageSize: page.pageSize, total: page.total },
      });
    },
  );

  // `/ask` is registered before `/:documentId`, which would otherwise match it.
  router.post(
    '/ask',
    describeRoute({
      tags,
      summary: 'Ask a question of the accessible documents',
      operationId: 'documentCenterAsk',
      description:
        'Answers from the documents the asker may read and cites the paragraphs it used. `hasAnswer` is false, with no citations, when nothing supports an answer; a document the asker may not read is never cited.',
      responses: {
        200: dataResponse(AnswerSchema),
        401: apiErrorResponse(401),
        500: apiErrorResponse(500),
      },
    }),
    apiValidator('json', AskInput),
    async (context) => {
      const actorId = context.get('authz').identity.principal.id;
      const result = await documents.ask({
        actorId,
        question: context.req.valid('json').question,
      });
      return context.json({ data: result });
    },
  );

  router.post(
    '/',
    requireManage(),
    describeRoute({
      tags,
      summary: 'Create a document',
      operationId: 'documentCenterCreateDocument',
      description:
        'A new document starts at version 1. A department-restricted document needs at least one department.',
      responses: {
        201: dataResponse(DocumentDetailSchema, 'The created document.'),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'A department-restricted document has no department (`DOCUMENT_DEPARTMENTS_REQUIRED`), or a department does not exist (`DEPARTMENT_NOT_FOUND`).',
        ),
        409: apiErrorResponse(
          409,
          'A document with this code already exists (`DOCUMENT_CODE_TAKEN`).',
        ),
      },
    }),
    apiValidator('json', CreateDocumentInput),
    async (context) => {
      const actorId = context.get('authz').identity.principal.id;
      const document = await documents.createDocument({
        actorId,
        values: context.req.valid('json'),
      });
      return context.json({ data: document }, 201);
    },
  );

  router.get(
    '/:documentId',
    describeRoute({
      tags,
      summary: 'Read a document',
      operationId: 'documentCenterGetDocument',
      responses: {
        200: dataResponse(DocumentDetailSchema),
        401: apiErrorResponse(401),
        403: apiErrorResponse(
          403,
          'The document exists but is not visible to the caller (`DOCUMENT_ACCESS_DENIED`).',
        ),
        404: apiErrorResponse(404, 'No such document (`DOCUMENT_NOT_FOUND`).'),
        500: apiErrorResponse(500),
      },
    }),
    apiValidator('param', DocumentParams),
    async (context) => {
      const { documentId } = context.req.valid('param');
      const actorId = context.get('authz').identity.principal.id;
      const actorCanManage = await context.get('authz').can({
        resource: { type: 'settings', id: DOCUMENT_CENTER_SETTINGS_ID },
        action: 'manage',
      });
      const document = await documents.getDocument({
        actorId,
        actorCanManage,
        documentId,
      });
      return context.json({ data: document });
    },
  );

  router.patch(
    '/:documentId',
    requireManage(),
    describeRoute({
      tags,
      summary: 'Update a document',
      operationId: 'documentCenterUpdateDocument',
      description:
        'Writes a new version and keeps the previous one. `expectedVersion` makes the write fail when someone else has changed the document since it was read.',
      responses: {
        200: dataResponse(DocumentDetailSchema, 'The updated document.'),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'A department-restricted document has no department (`DOCUMENT_DEPARTMENTS_REQUIRED`), or a department does not exist (`DEPARTMENT_NOT_FOUND`).',
        ),
        404: apiErrorResponse(404, 'No such document (`DOCUMENT_NOT_FOUND`).'),
        409: apiErrorResponse(
          409,
          'The document changed since it was read (`DOCUMENT_VERSION_CONFLICT`), or the code is taken (`DOCUMENT_CODE_TAKEN`).',
        ),
      },
    }),
    apiValidator('param', DocumentParams),
    apiValidator('json', UpdateDocumentInput),
    async (context) => {
      const { documentId } = context.req.valid('param');
      const actorId = context.get('authz').identity.principal.id;
      const document = await documents.updateDocument({
        actorId,
        documentId,
        values: context.req.valid('json'),
      });
      return context.json({ data: document });
    },
  );

  router.delete(
    '/:documentId',
    requireManage(),
    describeRoute({
      tags,
      summary: 'Delete a document',
      operationId: 'documentCenterDeleteDocument',
      description:
        'Marks the document deleted without removing it or its versions, so it can be restored.',
      responses: {
        204: emptyResponse('The document was marked deleted.'),
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'No such document (`DOCUMENT_NOT_FOUND`).'),
      },
    }),
    apiValidator('param', DocumentParams),
    async (context) => {
      const { documentId } = context.req.valid('param');
      const actorId = context.get('authz').identity.principal.id;
      await documents.deleteDocument({ actorId, documentId });
      return context.body(null, 204);
    },
  );

  router.post(
    '/:documentId/restore',
    requireManage(),
    describeRoute({
      tags,
      summary: 'Restore a deleted document',
      operationId: 'documentCenterRestoreDocument',
      description: 'Clears the deletion mark. The document returns unchanged.',
      responses: {
        200: dataResponse(DocumentSummarySchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'No such document (`DOCUMENT_NOT_FOUND`).'),
      },
    }),
    apiValidator('param', DocumentParams),
    async (context) => {
      const { documentId } = context.req.valid('param');
      const document = await documents.restoreDocument({ documentId });
      return context.json({ data: document });
    },
  );

  router.get(
    '/:documentId/versions',
    describeRoute({
      tags,
      summary: 'List a document’s versions',
      operationId: 'documentCenterListDocumentVersions',
      description: 'Newest first, with the content of each version.',
      responses: {
        200: listResponse(DocumentVersionSchema),
        401: apiErrorResponse(401),
        403: apiErrorResponse(
          403,
          'The document exists but is not visible to the caller (`DOCUMENT_ACCESS_DENIED`).',
        ),
        404: apiErrorResponse(404, 'No such document (`DOCUMENT_NOT_FOUND`).'),
        500: apiErrorResponse(500),
      },
    }),
    apiValidator('param', DocumentParams),
    async (context) => {
      const { documentId } = context.req.valid('param');
      const actorId = context.get('authz').identity.principal.id;
      const actorCanManage = await context.get('authz').can({
        resource: { type: 'settings', id: DOCUMENT_CENTER_SETTINGS_ID },
        action: 'manage',
      });
      const versions = await documents.listVersions({
        actorId,
        actorCanManage,
        documentId,
      });
      return context.json({ data: versions });
    },
  );

  router.post(
    '/:documentId/versions/:version/restore',
    requireManage(),
    describeRoute({
      tags,
      summary: 'Restore a document version',
      operationId: 'documentCenterRestoreDocumentVersion',
      description:
        'Copies the chosen version’s content and visibility into a new current version; the existing history is kept.',
      responses: {
        200: dataResponse(DocumentDetailSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'A department the version referenced no longer exists (`DEPARTMENT_NOT_FOUND`).',
        ),
        404: apiErrorResponse(
          404,
          'No such document or version (`DOCUMENT_NOT_FOUND`).',
        ),
      },
    }),
    apiValidator('param', DocumentVersionParams),
    apiValidator('json', RestoreVersionInput),
    async (context) => {
      const { documentId, version } = context.req.valid('param');
      const actorId = context.get('authz').identity.principal.id;
      const document = await documents.restoreVersion({
        actorId,
        documentId,
        version,
        changeNote: context.req.valid('json').changeNote,
      });
      return context.json({ data: document });
    },
  );

  return router;
}
