import { Hono, type Context } from 'hono';

import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { databaseManagerToken, type RepositoryPolicy } from '@nocobase/db';
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
import type { Application } from '@nocobase/app-server/application';

import type { DocumentRow } from '../documents-resources.js';
import {
  CreateDocumentInput,
  CreateDocumentShareInput,
  DocumentParams,
  DocumentSchema,
  DocumentShareSchema,
  ListDocumentsQuery,
  ShareParams,
  UpdateDocumentInput,
  type DocumentDto,
  type DocumentShareDto,
} from './schemas.js';

const COLLECTION = 'documents';
const SHARES = 'documentShares';
const COMPOSITE = { type: 'composite', id: 'documents' } as const;
const ADMIN_SETTINGS = { type: 'settings', id: 'documents.admin' } as const;

type CompositeAction = 'view' | 'create' | 'edit' | 'delete';

interface DocumentShareRow {
  readonly id: number;
  readonly documentId: number;
  readonly userId: string;
  readonly createdAt: Date | string;
}

interface UserRow {
  readonly id: string;
  readonly name: string | null;
}

/** Every action allowed, which is what an unrestricted identity's decision folds to. */
const ALLOW_ALL: RepositoryPolicy<DocumentRow> = {
  read: true,
  create: true,
  update: true,
  delete: true,
};

/**
 * What a caller who holds no grant for an action gets. It is only ever used to answer `canEdit`/`canDelete` on a row,
 * so the caller's own write routes keep asking `compositePolicy` and refusing with a 403.
 */
const DENY_ALL: RepositoryPolicy<DocumentRow> = {
  read: false,
  create: false,
  update: false,
  delete: false,
};

function toIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function denied(reason: string, message: string): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason,
    domain: 'documents',
    message,
  });
}

function notFound(): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'DOCUMENT_NOT_FOUND',
    domain: 'documents',
    message: 'The document does not exist or is not visible to you.',
  });
}

/**
 * The document library's HTTP surface.
 *
 * The read side is deliberately one query: `documents.readable` already excludes confidential documents from everyone
 * but their owner, so a reader who holds a share for a confidential document still receives nothing. The write side
 * binds the caller's own `edit`/`delete` scope, which is ownership, so an editor cannot reach another person's
 * document even though they may read it.
 */
export const documentsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const container = app.container;
    const auth = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const manager = container.resolve(databaseManagerToken);

    // The contribution mounts at `/` under `/api`, beside every other contribution. Authentication and the
    // permission middleware belong to this feature's paths only: a `use('*')` on the returned router would run for
    // every `/api` request, including paths this feature does not own. The isolated sub-router keeps it inside
    // `/documents`.
    const routes = new Hono<AuthorizationEnv>();
    const documents = new Hono<AuthorizationEnv>();
    routes.onError(apiErrorHandler);
    documents.use('*', auth.required(), authorization.middleware());

    /**
     * The Repository Policy the caller's business grant produces for one composite action. A `deny` has none; a
     * bare `permit`, which an unrestricted administrator gets, allows everything.
     */
    const compositePolicy = async (
      context: Context<AuthorizationEnv>,
      action: CompositeAction,
    ): Promise<RepositoryPolicy<DocumentRow> | undefined> => {
      const decision = await context.get('authz').authorize({
        resource: COMPOSITE,
        action,
      });
      if (decision.effect === 'deny') {
        return undefined;
      }
      const policy = decision.conditions?.database?.[COLLECTION];
      if (policy) {
        return policy;
      }
      return decision.effect === 'permit' ? ALLOW_ALL : undefined;
    };

    const principalIdOf = (context: Context<AuthorizationEnv>): string =>
      String(context.get('authz').identity.principal.id ?? '');

    const displayNames = async (
      ids: readonly string[],
    ): Promise<Map<string, string | null>> => {
      const unique = [...new Set(ids.filter((id) => Boolean(id)))];
      if (!unique.length) {
        return new Map();
      }
      const users = manager.repository<UserRow>('user');
      const rows = await users.findMany({
        filter: (filter) =>
          filter.or(unique.map((id) => filter.string('id').eq(id))),
      });
      return new Map(rows.map((row) => [String(row.id), row.name ?? null]));
    };

    const toShareDto = async (
      share: DocumentShareRow,
    ): Promise<DocumentShareDto> => {
      const names = await displayNames([share.userId]);
      return {
        id: share.id,
        documentId: share.documentId,
        userId: share.userId,
        userName: names.get(share.userId) ?? null,
        createdAt: toIso(share.createdAt),
      };
    };

    const toDto = async (
      rows: readonly Partial<DocumentRow>[],
      edit: RepositoryPolicy<DocumentRow>,
      remove: RepositoryPolicy<DocumentRow>,
      principalId: string,
    ): Promise<DocumentDto[]> => {
      const names = await displayNames(
        rows.map((row) => String(row.ownerId ?? '')),
      );
      return rows.map((row) => {
        const ownerId = String(row.ownerId ?? '');
        const owned = ownerId !== '' && ownerId === principalId;
        return {
          id: Number(row.id ?? 0),
          title: String(row.title ?? ''),
          body: row.body == null ? null : String(row.body),
          ownerId,
          ownerName: names.get(ownerId) ?? null,
          published: Boolean(row.published),
          confidential: Boolean(row.confidential),
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
          canEdit: edit.update !== false && (edit.update === true || owned),
          canDelete:
            remove.delete !== false && (remove.delete === true || owned),
        };
      });
    };

    const requireAdmin = async (
      context: Context<AuthorizationEnv>,
      action: 'read' | 'manage' = 'read',
    ): Promise<void> => {
      await context.get('authz').require({ resource: ADMIN_SETTINGS, action });
    };

    documents.get(
      '/',
      describeRoute({
        tags: ['Documents'],
        summary: 'List the documents the caller may read',
        operationId: 'listDocuments',
        responses: {
          '200': listResponse(DocumentSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListDocumentsQuery),
      async (context) => {
        const query = context.req.valid('query');
        const view = await compositePolicy(context, 'view');
        if (!view || view.read === false) {
          throw denied(
            'DOCUMENTS_READ_DENIED',
            'Reading documents is not allowed.',
          );
        }
        const edit = (await compositePolicy(context, 'edit')) ?? DENY_ALL;
        const remove = (await compositePolicy(context, 'delete')) ?? DENY_ALL;
        const principalId = principalIdOf(context);

        const search = query.q;
        const listFilter = search
          ? (filter: {
              string(path: string): { includes(value: string): unknown };
            }) => filter.string('title').includes(search) as never
          : undefined;

        const repository = manager
          .repository<DocumentRow>(COLLECTION)
          .withPolicy(view);
        const [records, total] = await Promise.all([
          repository.findMany({
            ...(listFilter ? { filter: listFilter } : {}),
            sort: (sort) =>
              query.sortOrder === 'asc'
                ? sort.field(query.sortBy).asc()
                : sort.field(query.sortBy).desc(),
            limit: query.pageSize,
            offset: (query.page - 1) * query.pageSize,
          }),
          repository.count(listFilter ? { filter: listFilter } : {}),
        ]);

        return context.json({
          data: await toDto(records, edit, remove, principalId),
          meta: {
            page: query.page,
            pageSize: query.pageSize,
            total,
          },
        });
      },
    );

    documents.post(
      '/',
      describeRoute({
        tags: ['Documents'],
        summary: 'Create a document owned by the caller',
        operationId: 'createDocument',
        responses: {
          '200': dataResponse(DocumentSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateDocumentInput),
      async (context) => {
        const input = context.req.valid('json');
        const create = await compositePolicy(context, 'create');
        if (!create || create.create === false) {
          throw denied(
            'DOCUMENTS_CREATE_DENIED',
            'Creating documents is not allowed.',
          );
        }
        const principalId = principalIdOf(context);
        const now = new Date();

        const repository = manager
          .repository<DocumentRow>(COLLECTION)
          .withPolicy(create);
        const { record } = await repository.createOne({
          values: {
            title: input.title,
            body: input.body ?? null,
            ownerId: principalId,
            published: input.published ?? false,
            confidential: input.confidential ?? false,
            createdAt: now,
            updatedAt: now,
          },
        });

        const edit = (await compositePolicy(context, 'edit')) ?? DENY_ALL;
        const remove = (await compositePolicy(context, 'delete')) ?? DENY_ALL;
        const [dto] = await toDto([record], edit, remove, principalId);
        return context.json({ data: dto });
      },
    );

    documents.get(
      '/:id',
      describeRoute({
        tags: ['Documents'],
        summary: 'Read one document the caller may read',
        operationId: 'getDocument',
        responses: {
          '200': dataResponse(DocumentSchema),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        const { id } = context.req.valid('param');
        const view = await compositePolicy(context, 'view');
        if (!view || view.read === false) {
          throw denied(
            'DOCUMENTS_READ_DENIED',
            'Reading documents is not allowed.',
          );
        }
        const principalId = principalIdOf(context);
        const edit = (await compositePolicy(context, 'edit')) ?? DENY_ALL;
        const remove = (await compositePolicy(context, 'delete')) ?? DENY_ALL;

        const record = await manager
          .repository<DocumentRow>(COLLECTION)
          .withPolicy(view)
          .findOne({ filter: (filter) => filter.number('id').eq(id) });
        if (!record) {
          throw notFound();
        }
        const [dto] = await toDto([record], edit, remove, principalId);
        return context.json({ data: dto });
      },
    );

    documents.patch(
      '/:id',
      describeRoute({
        tags: ['Documents'],
        summary: 'Edit a document the caller owns',
        operationId: 'updateDocument',
        responses: {
          '200': dataResponse(DocumentSchema),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', DocumentParams),
      apiValidator('json', UpdateDocumentInput),
      async (context) => {
        const { id } = context.req.valid('param');
        const input = context.req.valid('json');
        const edit = await compositePolicy(context, 'edit');
        if (!edit || edit.update === false) {
          throw denied(
            'DOCUMENTS_EDIT_DENIED',
            'Editing documents is not allowed.',
          );
        }
        const view = (await compositePolicy(context, 'view')) ?? ALLOW_ALL;
        const remove = (await compositePolicy(context, 'delete')) ?? DENY_ALL;
        const principalId = principalIdOf(context);

        const values = {
          ...('title' in input ? { title: input.title } : {}),
          ...('body' in input ? { body: input.body ?? null } : {}),
          ...('published' in input ? { published: input.published } : {}),
          ...('confidential' in input
            ? { confidential: input.confidential }
            : {}),
          updatedAt: new Date(),
        };

        const { updatedCount } = await manager
          .repository<DocumentRow>(COLLECTION)
          .withPolicy(edit)
          .updateMany({
            filter: (filter) => filter.number('id').eq(id),
            values,
          });
        if (!updatedCount) {
          throw notFound();
        }

        const record = await manager
          .repository<DocumentRow>(COLLECTION)
          .withPolicy(view)
          .findOne({ filter: (filter) => filter.number('id').eq(id) });
        if (!record) {
          throw notFound();
        }
        const [dto] = await toDto([record], edit, remove, principalId);
        return context.json({ data: dto });
      },
    );

    documents.delete(
      '/:id',
      describeRoute({
        tags: ['Documents'],
        summary: 'Delete a document the caller owns',
        operationId: 'deleteDocument',
        responses: {
          '204': emptyResponse(),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        const { id } = context.req.valid('param');
        const remove = await compositePolicy(context, 'delete');
        if (!remove || remove.delete === false) {
          throw denied(
            'DOCUMENTS_DELETE_DENIED',
            'Deleting documents is not allowed.',
          );
        }
        const { deletedCount } = await manager
          .repository<DocumentRow>(COLLECTION)
          .withPolicy(remove)
          .deleteMany({ filter: (filter) => filter.number('id').eq(id) });
        if (!deletedCount) {
          throw notFound();
        }
        return context.body(null, 204);
      },
    );

    // The administration surface: only an administrator reaches these, so the checks are on the settings item rather
    // than on the document itself. A share here does not override `documents.readable`, which is what keeps a
    // confidential document closed.
    documents.get(
      '/:id/shares',
      describeRoute({
        tags: ['Documents'],
        summary: 'List the temporary shares of one document',
        operationId: 'listDocumentShares',
        responses: {
          '200': listResponse(DocumentShareSchema),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', DocumentParams),
      async (context) => {
        await requireAdmin(context);
        const { id } = context.req.valid('param');
        const document = await manager
          .repository<DocumentRow>(COLLECTION)
          .findOne({ filter: (filter) => filter.number('id').eq(id) });
        if (!document) {
          throw notFound();
        }
        const shares = await manager
          .repository<DocumentShareRow>(SHARES)
          .findMany({
            filter: (filter) => filter.number('documentId').eq(id),
            sort: (sort) => sort.field('createdAt').desc(),
          });
        const names = await displayNames(shares.map((share) => share.userId));
        const data: DocumentShareDto[] = shares.map((share) => ({
          id: share.id,
          documentId: share.documentId,
          userId: share.userId,
          userName: names.get(share.userId) ?? null,
          createdAt: toIso(share.createdAt),
        }));
        return context.json({ data, meta: { total: data.length } });
      },
    );

    documents.post(
      '/:id/shares',
      describeRoute({
        tags: ['Documents'],
        summary:
          'Open one document to one reader without broadening their other access',
        operationId: 'createDocumentShare',
        responses: {
          '200': dataResponse(DocumentShareSchema),
          '400': apiErrorResponse(400),
          '404': apiErrorResponse(404),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', DocumentParams),
      apiValidator('json', CreateDocumentShareInput),
      async (context) => {
        await requireAdmin(context, 'manage');
        const { id } = context.req.valid('param');
        const { userId } = context.req.valid('json');

        const document = await manager
          .repository<DocumentRow>(COLLECTION)
          .findOne({ filter: (filter) => filter.number('id').eq(id) });
        if (!document) {
          throw notFound();
        }
        const user = await manager
          .repository<UserRow>('user')
          .findOne({ filter: (filter) => filter.string('id').eq(userId) });
        if (!user) {
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'DOCUMENT_SHARE_USER_UNKNOWN',
            domain: 'documents',
            message: 'The user to share with does not exist.',
          });
        }

        const shares = manager.repository<DocumentShareRow>(SHARES);
        const existing = await shares.findOne({
          filter: (filter) =>
            filter.and([
              filter.number('documentId').eq(id),
              filter.string('userId').eq(userId),
            ]),
        });
        if (existing) {
          return context.json({ data: await toShareDto(existing) });
        }

        const { record } = await shares.createOne({
          values: { documentId: id, userId, createdAt: new Date() },
        });
        return context.json({ data: await toShareDto(record) });
      },
    );

    documents.delete(
      '/:id/shares/:userId',
      describeRoute({
        tags: ['Documents'],
        summary: 'Revoke one document share',
        operationId: 'deleteDocumentShare',
        responses: {
          '204': emptyResponse(),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ShareParams),
      async (context) => {
        await requireAdmin(context, 'manage');
        const { id, userId } = context.req.valid('param');
        await manager.repository<DocumentShareRow>(SHARES).deleteMany({
          filter: (filter) =>
            filter.and([
              filter.number('documentId').eq(id),
              filter.string('userId').eq(userId),
            ]),
        });
        return context.body(null, 204);
      },
    );

    routes.route('/documents', documents);

    // `AppRouterFactory` is typed against the default Hono env, while the handlers here read `authz` from
    // `AuthorizationEnv`; the cast is only on the router's declared variables, never on a handler's behavior.
    return routes as unknown as Hono;
  });

export default documentsApiRoutes;
