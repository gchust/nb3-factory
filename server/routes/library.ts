import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { validateDataScopeRule } from '@nocobase/app-plugin-authorization/server/extension';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import {
  defineSharingRule,
  type SharingRulesAuthorizationApi,
} from '@nocobase/authorization/sharing-rules';
import { databaseManagerToken, RepositoryError } from '@nocobase/db';
import type { DatabaseConnection } from '@nocobase/db';
import { Hono } from 'hono';
import type { Context } from 'hono';

import { LIBRARY_RESOURCE, libraryDocuments } from '../library/documents.js';
import type { DocumentRecord } from '../library/documents.js';

/**
 * The document library's HTTP surface.
 *
 * The routes own their own authentication and authorization: installing the
 * authentication middleware proves who is calling, and every handler then asks
 * the request's Authorization context for the composite action it needs. The
 * repository is bound to the policy that decision produced, so a refusal is
 * enforced by the database query rather than by filtering rows in JavaScript.
 */

/** The Authorization with the rule plugins the application's configuration adds. */
type LibraryAuthorization = AppAuthorization &
  SharingRulesAuthorizationApi<DatabaseConnection>;

const SHARING_SETTINGS = 'authorization.sharing-rules';

/** Raised by this module's request parsing, so only invalid input answers 400. */
class LibraryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryInputError';
  }
}

function shareRuleKey(documentId: string, userId: string) {
  return `library-share-${documentId}-${userId}`;
}

function sharePrefix(documentId: string) {
  return `library-share-${documentId}-`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LibraryInputError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, label: string) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new LibraryInputError(`${label} must be a string`);
  }
  return value;
}

function optionalBoolean(value: unknown, label: string) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new LibraryInputError(`${label} must be a boolean`);
  }
  return value;
}

function requiredTitle(value: unknown) {
  const title = optionalString(value, 'title');
  if (!title || title.trim().length === 0) {
    throw new LibraryInputError('title is required');
  }
  return title.trim();
}

export const apiRoutes = defineApiRoutes<Application>(({ container }) => {
  // The inner router carries the authorization Variables type so `context.get`
  // is typed; the outer router stays untyped and is what the app mounts.
  const router = new Hono();
  const library = new Hono<AuthorizationEnv>();
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(
    authorizationToken,
  ) as LibraryAuthorization;
  const database = container.resolve(databaseManagerToken);
  const users = container.resolve(userManagementServiceToken);

  library.onError((error, context) => {
    if (error instanceof AuthorizationDeniedError) {
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
    }
    if (error instanceof RepositoryError) {
      switch (error.code) {
        case 'RECORD_NOT_FOUND':
        case 'RELATION_TARGET_NOT_FOUND':
          return context.json(
            { code: error.code, message: error.message },
            404,
          );
        case 'WRITE_FORBIDDEN':
        case 'FIELD_WRITE_FORBIDDEN':
        case 'RELATION_WRITE_FORBIDDEN':
        case 'READ_FORBIDDEN':
        case 'FIELD_READ_FORBIDDEN':
        case 'RELATION_READ_FORBIDDEN':
        case 'SCOPE_VIOLATION':
          return context.json(
            { code: error.code, message: error.message },
            403,
          );
        default:
          return context.json(
            { code: error.code, message: error.message },
            400,
          );
      }
    }
    if (error instanceof LibraryInputError) {
      return context.json(
        { code: 'INVALID_INPUT', message: error.message },
        400,
      );
    }
    if (error instanceof TypeError) {
      // Rule validation, including the sharing-rule scope check, reports this way.
      return context.json(
        { code: 'INVALID_RULE', message: error.message },
        400,
      );
    }
    throw error;
  });

  // Every path this router owns needs a session and the request's Authorization
  // context; the middleware is scoped to this router, not the application.
  library.use('*', authentication.required(), authorization.middleware());

  /**
   * The Repository Policy for a composite action, or `undefined` when the
   * identity may not perform it at all. A conditional decision carries the
   * policy; a permit (an unrestricted identity) carries a policy that reaches
   * every record.
   */
  const policyFor = async <P extends string>(
    context: Context<AuthorizationEnv, P>,
    action: string,
  ) => {
    const decision = await context.get('authz').authorize({
      resource: { type: 'composite', id: LIBRARY_RESOURCE },
      action,
    });
    if (decision.effect === 'deny') {
      return undefined;
    }
    return decision.conditions?.database?.documents;
  };

  /**
   * Temporary access is administration work. An identity that holds the
   * sharing-rules settings capability manages it directly; a document manager
   * may instead manage it for the documents their own `edit` action reaches.
   */
  const requireShareManagement = async <P extends string>(
    context: Context<AuthorizationEnv, P>,
    action: 'read' | 'create' | 'delete',
  ): Promise<void> => {
    const authz = context.get('authz');
    try {
      await authz.require({
        resource: { type: 'settings', id: SHARING_SETTINGS },
        action,
      });
      return;
    } catch (error) {
      if (!(error instanceof AuthorizationDeniedError)) {
        throw error;
      }
    }
    // A document manager may instead manage sharing for the documents their own
    // `edit` action reaches. The composite decision is `conditional` for any
    // permission-set identity, so a non-deny decision is what permits this; the
    // composed policy still bounds what the management routes can touch.
    const decision = await authz.authorize({
      resource: { type: 'composite', id: LIBRARY_RESOURCE },
      action: 'edit',
    });
    if (decision.effect === 'deny') {
      throw new AuthorizationDeniedError(decision);
    }
  };

  const documents = () => database.repository<DocumentRecord>('documents');

  /**
   * Adds the owner's display name to records the caller is already allowed to
   * read, so the list shows who wrote a document without exposing the whole
   * user directory.
   */
  const withOwnerName = async <T extends { ownerId?: string }>(
    rows: readonly T[],
  ): Promise<Array<T & { ownerName?: string }>> => {
    const ownerIds = [...new Set(rows.map((row) => row.ownerId))].filter(
      (id): id is string => Boolean(id),
    );
    const names = new Map<string, string>();
    if (ownerIds.length > 0) {
      const owners = await database
        .query()
        .selectFrom('user')
        .select(['id', 'name'])
        .where('id', 'in', ownerIds)
        .execute();
      for (const owner of owners) {
        names.set(
          String(owner.id),
          typeof owner.name === 'string' ? owner.name : '',
        );
      }
    }
    return rows.map((row) => ({
      ...row,
      ownerName: row.ownerId
        ? (names.get(row.ownerId) ?? row.ownerId)
        : undefined,
    }));
  };

  const sharesFor = async (documentId: string) => {
    const rules = await authorization.sharingRules.list();
    return rules
      .filter((rule) => rule.key.startsWith(sharePrefix(documentId)))
      .flatMap((rule) =>
        rule.subjects.map((subject) => ({
          ruleKey: rule.key,
          userId: subject.id,
          subjectType: subject.type,
        })),
      );
  };

  library.get('/documents', async (context) => {
    const policy = await policyFor(context, 'view');
    if (!policy) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const rows = await documents()
      .withPolicy(policy)
      .findMany({
        sort: (sort) => sort.field('updatedAt').desc(),
        limit: 200,
      });
    return context.json({ data: await withOwnerName(rows) });
  });

  library.get('/documents/:id', async (context) => {
    const policy = await policyFor(context, 'view');
    if (!policy) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const row = await documents()
      .withPolicy(policy)
      .findOne({ filter: { id: context.req.param('id') } });
    if (!row) {
      return context.json({ code: 'NOT_FOUND' }, 404);
    }
    return context.json({ data: (await withOwnerName([row]))[0] });
  });

  library.post('/documents', async (context) => {
    const policy = await policyFor(context, 'create');
    if (!policy) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const input = record(await context.req.json(), 'Document');
    const principal = context.get('authz').identity.principal;
    // `documents` declares these as NOT NULL without a database default; the
    // Repository does not fill timestamps, so the writer supplies them.
    const now = new Date();
    const result = await documents()
      .withPolicy(policy)
      .createOne({
        values: {
          id: crypto.randomUUID(),
          title: requiredTitle(input.title),
          body: optionalString(input.body, 'body') ?? null,
          ownerId: principal.id,
          published: optionalBoolean(input.published, 'published') ?? false,
          confidential:
            optionalBoolean(input.confidential, 'confidential') ?? false,
          createdAt: now,
          updatedAt: now,
        },
      });
    return context.json(
      { data: (await withOwnerName([result.record]))[0] },
      201,
    );
  });

  library.patch('/documents/:id', async (context) => {
    const policy = await policyFor(context, 'edit');
    if (!policy) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const input = record(await context.req.json(), 'Document');
    const values: Partial<DocumentRecord> = { updatedAt: new Date() };
    const title = optionalString(input.title, 'title');
    if (title !== undefined) {
      values.title = requiredTitle(title);
    }
    if (input.body !== undefined) {
      values.body = optionalString(input.body, 'body') ?? null;
    }
    const published = optionalBoolean(input.published, 'published');
    if (published !== undefined) {
      values.published = published;
    }
    const confidential = optionalBoolean(input.confidential, 'confidential');
    if (confidential !== undefined) {
      values.confidential = confidential;
    }
    const result = await documents()
      .withPolicy(policy)
      .updateOne({ filter: { id: context.req.param('id') }, values });
    return context.json({ data: (await withOwnerName([result.record]))[0] });
  });

  library.delete('/documents/:id', async (context) => {
    const policy = await policyFor(context, 'delete');
    if (!policy) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    await documents()
      .withPolicy(policy)
      .deleteOne({ filter: { id: context.req.param('id') } });
    return context.json({ data: { id: context.req.param('id') } });
  });

  // The share picker and temporary-access management are administration work:
  // they use the built-in sharing-rules settings capability rather than the
  // library's own actions.
  library.get('/recipients', async (context) => {
    await requireShareManagement(context, 'read');
    const page = await users.list({
      page: 1,
      pageSize: 100,
      search: context.req.query('search') || undefined,
      status: 'enabled',
    });
    return context.json({ data: page });
  });

  library.get('/documents/:id/shares', async (context) => {
    await requireShareManagement(context, 'read');
    return context.json({
      data: await sharesFor(context.req.param('id')),
    });
  });

  library.post('/documents/:id/share', async (context) => {
    await requireShareManagement(context, 'create');
    const documentId = context.req.param('id');
    const input = record(await context.req.json(), 'Share');
    const userId = optionalString(input.userId, 'userId');
    if (!userId) {
      throw new LibraryInputError('userId is required');
    }
    const existing = await sharesFor(documentId);
    if (existing.some((share) => share.userId === userId)) {
      return context.json({
        data: { ruleKey: shareRuleKey(documentId, userId) },
      });
    }
    const rule = defineSharingRule(
      shareRuleKey(documentId, userId),
      libraryDocuments.reference(),
    )
      .scope('view', 'documents', { type: 'records', ids: [documentId] })
      .subjects({ type: 'user', id: userId })
      .reason('临时共享给指定读者')
      .build();
    validateDataScopeRule(authorization, rule);
    await authorization.sharingRules.create(rule);
    return context.json({ data: { ruleKey: rule.key } }, 201);
  });

  library.delete('/documents/:id/share/:userId', async (context) => {
    await requireShareManagement(context, 'delete');
    const key = shareRuleKey(
      context.req.param('id'),
      context.req.param('userId'),
    );
    await authorization.sharingRules.delete(key);
    return context.json({ data: { removed: true } });
  });

  router.route('/library', library);
  return router;
});
