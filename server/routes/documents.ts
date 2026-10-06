import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
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
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { documentsServiceToken } from '../documents-service.js';
import {
  DocumentParams,
  DocumentSchema,
  ListDocumentsQuery,
  UpdateDocumentInput,
} from './schemas.js';

const tags = ['Documents'];

/**
 * The documents API. Every handler reads through `DocumentsService`, which authorizes the action and
 * binds the caller's data scope to the query, so the supervisor-only document is filtered out in SQL.
 * A caller without the action is refused by the service rather than served an empty list.
 *
 * The routes live in their own router mounted at `/documents`, and the authentication and permission
 * middleware is scoped to that router's `*`. Written as a top-level `*` it would also answer for every
 * other `/api` path, turning an unregistered endpoint's 404 into this feature's 401.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const documents = app.container.resolve(documentsServiceToken);

    const routes = new Hono();
    routes.use('*', auth.required(), authorization.middleware());

    routes.get(
      '/',
      describeRoute({
        tags,
        summary: 'List the documents the caller may read',
        operationId: 'listDocuments',
        responses: {
          200: listResponse(DocumentSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListDocumentsQuery),
      async (context) => {
        const { q } = context.req.valid('query');
        const rows = await documents.search(actor(context), q);
        return context.json({ data: rows, meta: { total: rows.length } });
      },
    );

    routes.get(
      '/:id',
      describeRoute({
        tags,
        summary: 'Read one document the caller may read',
        operationId: 'getDocument',
        responses: {
          200: dataResponse(DocumentSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(
            404,
            'No document with this id is visible to the caller.',
          ),
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        const { id } = context.req.valid('param');
        const document = await documents.find(actor(context), id);
        // A row outside the caller's scope is reported as absent, never as forbidden: the endpoint
        // must not disclose that the supervisor-only document exists.
        if (!document) throw notFound(id);
        return context.json({ data: document });
      },
    );

    routes.put(
      '/:id',
      describeRoute({
        tags,
        summary: 'Update a document the caller may edit',
        operationId: 'updateDocument',
        responses: {
          200: dataResponse(DocumentSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(
            404,
            'No editable document with this id is visible to the caller.',
          ),
        },
      }),
      apiValidator('param', DocumentParams),
      apiValidator('json', UpdateDocumentInput),
      async (context) => {
        const { id } = context.req.valid('param');
        const input = context.req.valid('json');
        try {
          const updated = await documents.update(actor(context), id, input);
          return context.json({ data: updated });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === 'DOCUMENT_NOT_FOUND'
          ) {
            throw notFound(id);
          }
          throw error;
        }
      },
    );

    const router = new Hono();
    router.route('/documents', routes);
    return router;
  },
);

/** The signed-in identity, from the authorization middleware's own context. */
function actor(context: {
  get: (key: 'authz') => { identity: { principal: { id: string } } };
}): { id: string } {
  return { id: context.get('authz').identity.principal.id };
}

function notFound(id: number): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'DOCUMENT_NOT_FOUND',
    domain: 'documents',
    message: `Document ${id} was not found.`,
  });
}
