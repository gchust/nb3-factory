import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { databaseManagerToken } from '@nocobase/db';
import type { RepositoryPolicy, RepositoryRecord } from '@nocobase/db';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';

import { LIBRARY_COLLECTION } from '../library/resources.js';
import {
  CreateDocumentInput,
  DocumentParams,
  LibraryDocument,
  LibraryListMeta,
  ListDocumentsQuery,
  UpdateDocumentInput,
  type LibraryDocumentView,
} from './schemas.js';

/** The business actions the `library.documents` composite declares. */
type LibraryAction = 'view' | 'create' | 'edit' | 'delete';

/** The Collection policy key each business action decides. */
const CRUD_BY_ACTION: Record<
  LibraryAction,
  'read' | 'create' | 'update' | 'delete'
> = {
  view: 'read',
  create: 'create',
  edit: 'update',
  delete: 'delete',
};

type LibraryEnv = {
  Variables: AuthorizationEnv['Variables'] & {
    libraryPolicy: RepositoryPolicy;
  };
};

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return String(value);
}

/** Reads a text column without letting a non-string value stringify as `[object Object]`. */
function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toView(
  record: RepositoryRecord,
  currentUserId: string,
  canEditGranted: boolean,
  canDeleteGranted: boolean,
  ownerName: string | null,
): LibraryDocumentView {
  const ownerId = toText(record.ownerId);
  const isOwner = ownerId === currentUserId;
  return {
    id: toText(record.id),
    title: toText(record.title),
    body: typeof record.body === 'string' ? record.body : null,
    ownerId,
    ownerName,
    published: record.published === true,
    confidential: record.confidential === true,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    canEdit: canEditGranted && isOwner,
    canDelete: canDeleteGranted && isOwner,
  };
}

/**
 * The document library API.
 *
 * Every endpoint resolves the caller's Collection policy from the
 * `library.documents` business action and binds it to the Repository, so rows,
 * fields and relations are enforced in SQL. Ownership is applied through the
 * `library.owned` data scope rather than compared in the handler, and
 * confidential documents stay out of the reader scopes by construction.
 */
export const libraryRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);

    const router = new Hono();
    const routes = new Hono<LibraryEnv>();

    /**
     * Resolves the display names of document owners for the records a request
     * returns. `user` is queried at the database layer because the document
     * API must not expose the users Collection through a relation the caller
     * has no policy for; only the ids of already-visible documents are named.
     */
    async function resolveOwnerNames(
      ownerIds: readonly string[],
    ): Promise<Map<string, string>> {
      const unique = [...new Set(ownerIds.filter((id) => id !== ''))];
      if (unique.length === 0) return new Map();
      const rows = await database
        .query()
        .selectFrom('user')
        .select(['id', 'name'])
        .where('id', 'in', unique)
        .execute();
      return new Map(rows.map((row) => [toText(row.id), toText(row.name)]));
    }

    // Scoped to this sub-router only, so it never leaks into another route.
    routes.use('*', auth.required(), authorization.middleware());

    const policyFor = (
      context: {
        get: (key: 'authz') => AuthorizationEnv['Variables']['authz'];
      },
      action: LibraryAction,
    ) =>
      authorization.database.policyFor(
        LIBRARY_COLLECTION,
        context.get('authz'),
        { resource: 'library.documents', action },
      );

    /**
     * Resolves and stores the operation's policy, denying before any input is read.
     *
     * The stored policy is the caller's *view* policy with the operation's own
     * permission swapped in, because a write returns the row it wrote and the
     * Repository has to be allowed to read it back. Reading it back through the
     * view policy is what a later `GET` would do, so the write cannot return a
     * row the caller could not read.
     */
    const documentsAccess =
      (action: LibraryAction): MiddlewareHandler<LibraryEnv> =>
      async (context, next) => {
        const operationPolicy = await policyFor(context, action);
        const permission = CRUD_BY_ACTION[action];
        if (operationPolicy[permission] === false) {
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: `LIBRARY_${action.toUpperCase()}_DENIED`,
            domain: 'library',
            message: `The ${action} operation on the document library is not allowed.`,
          });
        }
        const viewPolicy =
          action === 'view'
            ? operationPolicy
            : await policyFor(context, 'view');
        context.set('libraryPolicy', {
          ...viewPolicy,
          [permission]: operationPolicy[permission],
        });
        await next();
      };

    const repository = (context: {
      get: (key: 'libraryPolicy') => RepositoryPolicy;
    }) =>
      database
        .repository(LIBRARY_COLLECTION)
        .withPolicy(context.get('libraryPolicy'));

    const currentUserId = (context: {
      get: (key: 'authz') => AuthorizationEnv['Variables']['authz'];
    }) => context.get('authz').identity.principal.id;

    routes.get(
      '/',
      documentsAccess('view'),
      describeRoute({
        tags: ['Library'],
        summary: 'List library documents',
        operationId: 'listLibraryDocuments',
        responses: {
          '200': listResponse(
            LibraryDocument,
            LibraryListMeta,
            'The documents the caller may read.',
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListDocumentsQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const createPolicy = await policyFor(context, 'create');
        const editPolicy = await policyFor(context, 'edit');
        const deletePolicy = await policyFor(context, 'delete');
        const canEditGranted = editPolicy.update !== false;
        const canDeleteGranted = deletePolicy.delete !== false;
        const userId = currentUserId(context);
        const documents = repository(context);
        const [records, total] = await Promise.all([
          documents.findMany({
            sort: (sort) => [
              sort.field('createdAt').desc(),
              sort.field('id').desc(),
            ],
            limit: pageSize,
            offset: (page - 1) * pageSize,
          }),
          documents.count(),
        ]);
        const ownerNames = await resolveOwnerNames(
          records.map((record) => toText(record.ownerId)),
        );
        return context.json({
          data: records.map((record) =>
            toView(
              record,
              userId,
              canEditGranted,
              canDeleteGranted,
              ownerNames.get(toText(record.ownerId)) ?? null,
            ),
          ),
          meta: {
            page,
            pageSize,
            total,
            canCreate: createPolicy.create !== false,
          },
        });
      },
    );

    routes.post(
      '/',
      documentsAccess('create'),
      describeRoute({
        tags: ['Library'],
        summary: 'Create a library document',
        operationId: 'createLibraryDocument',
        responses: {
          '201': dataResponse(LibraryDocument, 'The created document.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateDocumentInput),
      async (context) => {
        const input = context.req.valid('json');
        const now = new Date();
        const userId = currentUserId(context);
        const editPolicy = await policyFor(context, 'edit');
        const deletePolicy = await policyFor(context, 'delete');
        const { record } = await repository(context).createOne({
          // `id` and the timestamps are server-written; the body cannot name them.
          values: {
            id: crypto.randomUUID(),
            title: input.title,
            body: input.body ?? null,
            published: input.published ?? false,
            confidential: input.confidential ?? false,
            ownerId: userId,
            createdAt: now,
            updatedAt: now,
          },
        });
        return context.json(
          {
            data: toView(
              record,
              userId,
              editPolicy.update !== false,
              deletePolicy.delete !== false,
              (await resolveOwnerNames([userId])).get(userId) ?? null,
            ),
          },
          201,
        );
      },
    );

    routes.get(
      '/:documentId',
      documentsAccess('view'),
      describeRoute({
        tags: ['Library'],
        summary: 'Get a library document',
        operationId: 'getLibraryDocument',
        responses: {
          '200': dataResponse(LibraryDocument, 'The document.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        const { documentId } = context.req.valid('param');
        const editPolicy = await policyFor(context, 'edit');
        const deletePolicy = await policyFor(context, 'delete');
        const userId = currentUserId(context);
        const record = await repository(context).findOne({
          filter: { id: documentId },
        });
        if (!record) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'LIBRARY_DOCUMENT_NOT_FOUND',
            domain: 'library',
            message: `Document ${documentId} was not found.`,
          });
        }
        const ownerNames = await resolveOwnerNames([toText(record.ownerId)]);
        return context.json({
          data: toView(
            record,
            userId,
            editPolicy.update !== false,
            deletePolicy.delete !== false,
            ownerNames.get(toText(record.ownerId)) ?? null,
          ),
        });
      },
    );

    routes.patch(
      '/:documentId',
      documentsAccess('edit'),
      describeRoute({
        tags: ['Library'],
        summary: 'Update a library document',
        operationId: 'updateLibraryDocument',
        responses: {
          '200': dataResponse(LibraryDocument, 'The updated document.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', DocumentParams),
      apiValidator('json', UpdateDocumentInput),
      async (context) => {
        const { documentId } = context.req.valid('param');
        const input = context.req.valid('json');
        if (
          input.title === undefined &&
          input.body === undefined &&
          input.published === undefined &&
          input.confidential === undefined
        ) {
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'LIBRARY_NO_FIELDS',
            domain: 'library',
            message: 'The request names no field to update.',
          });
        }
        const userId = currentUserId(context);
        const deletePolicy = await policyFor(context, 'delete');
        const { record } = await repository(context).updateOne({
          filter: { id: documentId },
          values: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.body !== undefined ? { body: input.body } : {}),
            ...(input.published !== undefined
              ? { published: input.published }
              : {}),
            ...(input.confidential !== undefined
              ? { confidential: input.confidential }
              : {}),
            updatedAt: new Date(),
          },
        });
        return context.json({
          data: toView(
            record,
            userId,
            true,
            deletePolicy.delete !== false,
            (await resolveOwnerNames([toText(record.ownerId)])).get(
              toText(record.ownerId),
            ) ?? null,
          ),
        });
      },
    );

    routes.delete(
      '/:documentId',
      documentsAccess('delete'),
      describeRoute({
        tags: ['Library'],
        summary: 'Delete a library document',
        operationId: 'deleteLibraryDocument',
        responses: {
          '204': emptyResponse('The document was deleted.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        const { documentId } = context.req.valid('param');
        await repository(context).deleteOne({ filter: { id: documentId } });
        return context.body(null, 204);
      },
    );

    router.route('/library/documents', routes);
    return router;
  });

export default libraryRoutes;
