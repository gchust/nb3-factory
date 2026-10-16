import type { Application } from '@nocobase/app-server/application';
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
} from '@nocobase/app-server/router';
import {
  authorizationToken,
  type AppAuthorization,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { requireSettings } from '@nocobase/app-plugin-authorization/server/extension';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';
import type { SharingRule } from '@nocobase/authorization/sharing-rules';
import type { DatabaseConnection } from '@nocobase/db';
import { Hono, type MiddlewareHandler } from 'hono';

import {
  LIBRARY_RESOURCE_ID,
  LIBRARY_SCOPE,
  LIBRARY_SHARE_PREFIX,
  SHARING_RULES_SETTINGS,
} from '../../library/authorization.js';
import { documentLibraryToken } from '../../library/tokens.js';
import {
  LibraryDocument,
  LibraryDocumentBody,
  LibraryDocumentListMeta,
  LibraryDocumentParams,
  LibraryDocumentPatchBody,
  LibraryListQuery,
  LibraryShare,
  LibraryShareBody,
  LibraryShareParams,
} from './schemas.js';

/** The environment the library routers run in. */
type LibraryEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

const TAGS = ['Document library'];

/** The application's own error domain. */
const DOMAIN = 'library';

/** A sharing rule as the share panel reads it. */
interface LibraryShareValue {
  readonly key: string;
  readonly documentIds: readonly string[];
  readonly subjectIds: readonly string[];
  readonly reason: string | null;
}

const notFound = apiErrorResponse(
  404,
  'No document with this id is visible to the caller (`LIBRARY_DOCUMENT_NOT_FOUND`).',
);

/**
 * Checks the composite resource before a route's validators run, so an
 * unauthorized caller gets `403` without learning what input the route
 * expects. The service checks the same action again where it acts on data.
 */
function requireAction(action: string): MiddlewareHandler<LibraryEnv> {
  return async (context, next) => {
    const decision = await context.get('authz').authorize({
      resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
      action,
    });
    if (decision.effect === 'deny') {
      throw new AuthorizationDeniedError(decision);
    }
    await next();
  };
}

export function createLibraryRouter(app: Application): Hono {
  const router = new Hono<LibraryEnv>();
  router.onError((error, context) => apiErrorHandler(error, context));

  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const library = app.container.resolve(documentLibraryToken);
  const sharingRules = (
    authorization as AppAuthorization &
      SharingRulesAuthorizationApi<DatabaseConnection>
  ).sharingRules;

  for (const path of ['/library/documents', '/library/documents/*']) {
    router.use(path, auth.required(), authorization.middleware());
  }

  router.get(
    '/library/documents',
    requireAction('view'),
    describeRoute({
      tags: TAGS,
      summary: 'List the documents the caller may read',
      operationId: 'listLibraryDocuments',
      responses: {
        '200': listResponse(
          LibraryDocument,
          LibraryDocumentListMeta,
          'The documents the caller is allowed to read.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', LibraryListQuery),
    async (context) => {
      const page = await library.list(
        context.get('authz'),
        context.req.valid('query'),
      );
      return context.json({
        data: [...page.items],
        meta: {
          total: page.total,
          canCreate: page.canCreate,
        },
      });
    },
  );

  router.post(
    '/library/documents',
    requireAction('create'),
    describeRoute({
      tags: TAGS,
      summary: 'Create a document owned by the caller',
      operationId: 'createLibraryDocument',
      responses: {
        '201': dataResponse(LibraryDocument, 'The document that was created.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', LibraryDocumentBody),
    async (context) => {
      const document = await library.create(
        context.get('authz'),
        context.req.valid('json'),
      );
      return context.json({ data: document }, 201);
    },
  );

  router.get(
    '/library/documents/:id',
    requireAction('view'),
    describeRoute({
      tags: TAGS,
      summary: 'Read one document',
      operationId: 'getLibraryDocument',
      responses: {
        '200': dataResponse(LibraryDocument, 'The document.'),
        ...apiErrorResponses,
        '404': notFound,
      },
    }),
    apiValidator('param', LibraryDocumentParams),
    async (context) => {
      const { id } = context.req.valid('param');
      const document = await library.get(context.get('authz'), id);
      if (!document) {
        throw documentNotFound(id);
      }
      return context.json({ data: document });
    },
  );

  router.patch(
    '/library/documents/:id',
    requireAction('edit'),
    describeRoute({
      tags: TAGS,
      summary: 'Update a document the caller may edit',
      operationId: 'updateLibraryDocument',
      responses: {
        '200': dataResponse(LibraryDocument, 'The updated document.'),
        ...apiErrorResponses,
        '404': notFound,
      },
    }),
    apiValidator('param', LibraryDocumentParams),
    apiValidator('json', LibraryDocumentPatchBody),
    async (context) => {
      const { id } = context.req.valid('param');
      const document = await library.update(
        context.get('authz'),
        id,
        context.req.valid('json'),
      );
      if (!document) {
        throw documentNotFound(id);
      }
      return context.json({ data: document });
    },
  );

  // ----------------------------------------------------------- sharing rules
  //
  // Temporarily sharing one draft with one colleague is an administrator
  // action on the Sharing Rules settings surface. These routes are this
  // application's own UI for it: they reuse the same persisted Sharing Rules the
  // authorization backend serves, gated by the same
  // `settings:authorization.sharing-rules` permission, so an administrator can
  // also see and revoke what was shared here from the Authorization settings.

  const readSettings: MiddlewareHandler<LibraryEnv> = async (context, next) => {
    await requireSettings(context.get('authz'), SHARING_RULES_SETTINGS, 'read');
    await next();
  };

  router.get(
    '/library/documents/:id/shares',
    readSettings,
    describeRoute({
      tags: TAGS,
      summary: 'List the sharing rules that name a document',
      operationId: 'listLibraryDocumentShares',
      responses: {
        '200': listResponse(
          LibraryShare,
          undefined,
          'The sharing rules that name this document.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', LibraryDocumentParams),
    async (context) => {
      const { id } = context.req.valid('param');
      const rules = await sharingRules.list();
      const shares = rules
        .filter((rule) => rule.key.startsWith(`${LIBRARY_SHARE_PREFIX}.`))
        .filter((rule) => sharedDocumentIds(rule).includes(id))
        .map((rule) => shareView(rule));
      return context.json({
        data: shares,
        meta: { total: shares.length },
      });
    },
  );

  router.post(
    '/library/documents/:id/shares',
    describeRoute({
      tags: TAGS,
      summary: 'Share one document with one colleague',
      operationId: 'createLibraryDocumentShare',
      responses: {
        '201': dataResponse(LibraryShare, 'The sharing rule that was created.'),
        ...apiErrorResponses,
        '400': apiErrorResponse(
          400,
          'The body is not a valid subject, or the document is missing.',
        ),
      },
    }),
    apiValidator('param', LibraryDocumentParams),
    apiValidator('json', LibraryShareBody),
    async (context) => {
      await requireSettings(
        context.get('authz'),
        SHARING_RULES_SETTINGS,
        'create',
      );
      const { id } = context.req.valid('param');
      const { subjectId, reason } = context.req.valid('json');

      const document = await library.get(context.get('authz'), id);
      if (!document) {
        throw documentNotFound(id);
      }

      const key = shareKey(id, subjectId);
      const rule: SharingRule = {
        key,
        resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
        actions: [
          {
            action: 'view',
            scopeKey: LIBRARY_SCOPE,
            selection: { type: 'records', ids: [id] },
          },
        ],
        subjects: [{ type: 'user', id: subjectId }],
        ...(reason ? { reason } : {}),
      };

      const existing = await sharingRules.get(key);
      const saved = existing
        ? await sharingRules.update(key, rule)
        : await sharingRules.create(rule);
      return context.json({ data: shareView(saved) }, 201);
    },
  );

  router.delete(
    '/library/documents/:id/shares/:key',
    describeRoute({
      tags: TAGS,
      summary: 'Revoke a sharing rule',
      operationId: 'deleteLibraryDocumentShare',
      responses: {
        '204': emptyResponse('The sharing rule was deleted.'),
        ...apiErrorResponses,
        '404': apiErrorResponse(
          404,
          'No sharing rule with this key exists (`RULE_NOT_FOUND`).',
        ),
      },
    }),
    apiValidator('param', LibraryShareParams),
    async (context) => {
      await requireSettings(
        context.get('authz'),
        SHARING_RULES_SETTINGS,
        'delete',
      );
      const { key } = context.req.valid('param');
      const existing = await sharingRules.get(key);
      if (!existing) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'RULE_NOT_FOUND',
          domain: 'authorization',
          message: `Sharing rule ${key} was not found.`,
        });
      }
      await sharingRules.delete(key);
      return context.body(null, 204);
    },
  );

  // `AppRouterFactory` erases the router's context variables, so the
  // contribution is typed `Hono`; the handlers above still see `LibraryEnv`.
  return router as unknown as Hono;
}

export const apiRoutes = defineApiRoutes(createLibraryRouter);

function shareKey(documentId: string, subjectId: string): string {
  return `${LIBRARY_SHARE_PREFIX}.${documentId}.${subjectId}`;
}

/** The document ids a rule shares, ignoring its other actions and selections. */
function sharedDocumentIds(rule: SharingRule): readonly string[] {
  return rule.actions.flatMap((action) =>
    action.selection.type === 'records' ? action.selection.ids : [],
  );
}

function shareView(rule: SharingRule): LibraryShareValue {
  const ids = sharedDocumentIds(rule);
  return {
    key: rule.key,
    documentIds: [...new Set(ids)],
    subjectIds: rule.subjects.map((subject) => subject.id),
    reason: rule.reason ?? null,
  };
}

function documentNotFound(id: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'LIBRARY_DOCUMENT_NOT_FOUND',
    domain: DOMAIN,
    message: `No document with the id ${id} is visible to the caller.`,
  });
}
