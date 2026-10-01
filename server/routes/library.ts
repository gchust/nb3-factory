/**
 * The document library's HTTP surface.
 *
 * Every route authenticates, resolves an authorization context, and then asks
 * one composite action for the Repository Polices it composes. The route binds
 * the policy to a Repository; it never decides who may read or write, and it
 * never widens what the policy allows. The only root-only endpoints are the
 * share management ones, which are the `library.shares` capability.
 */
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationContext,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { type RepositoryPolicy } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import {
  libraryServiceToken,
  type LibraryDocumentPatch,
} from '../library-service.js';
import type {
  LibraryDocument,
  LibraryDocumentShare,
} from '../library-types.js';

/** Both middlewares run on these routes, so the context carries both variables. */
type LibraryEnv = AuthEnv & AuthorizationEnv;

const DOCUMENTS_RESOURCE = 'library.documents';
const SHARES_RESOURCE = 'library.shares';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_TITLE_LENGTH = 255;

/** A route answer for a caller whose composite action is not permitted. */
function forbidden(context: Context) {
  return context.json(
    { code: 'FORBIDDEN', message: 'This operation is not permitted.' },
    403,
  );
}

function badRequest(context: Context, message: string) {
  return context.json({ code: 'INVALID_INPUT', message }, 400);
}

function notFound(context: Context, message = 'Not found.') {
  return context.json({ code: 'NOT_FOUND', message }, 404);
}

/**
 * Authorizes one composite action and returns the Repository Policies it
 * composed, keyed by collection. A denied action returns nothing, which every
 * caller treats as a refusal; a caller must not read a missing collection as
 * "no restriction".
 */
async function policiesFor(
  authz: AuthorizationContext,
  resource: string,
  action: string,
): Promise<Readonly<Record<string, RepositoryPolicy>>> {
  const decision = await authz.authorize({
    resource: { type: 'composite', id: resource },
    action,
  });
  if (decision.effect === 'deny') {
    return {};
  }
  return decision.conditions?.database ?? {};
}

function policyFor<T extends object>(
  policies: Readonly<Record<string, RepositoryPolicy>>,
  collection: string,
): RepositoryPolicy<T> | undefined {
  return policies[collection] as RepositoryPolicy<T> | undefined;
}

/** The paging window, validated so a bad query is a 400, not a driver error. */
function listWindow(context: Context): { limit: number; offset: number } {
  const rawLimit = context.req.query('limit');
  const rawOffset = context.req.query('offset');
  const limit =
    rawLimit === undefined ? DEFAULT_PAGE_SIZE : Number.parseInt(rawLimit, 10);
  const offset = rawOffset === undefined ? 0 : Number.parseInt(rawOffset, 10);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    throw new BadInput(
      `limit must be between 1 and ${MAX_PAGE_SIZE}, offset must not be negative`,
    );
  }
  return { limit, offset };
}

class BadInput extends Error {}

async function readBody(context: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new BadInput('A JSON body is required.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadInput('A JSON object is required.');
  }
  return body as Record<string, unknown>;
}

function requireTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadInput('A non-empty title is required.');
  }
  if (value.length > MAX_TITLE_LENGTH) {
    throw new BadInput(
      `A title may not exceed ${MAX_TITLE_LENGTH} characters.`,
    );
  }
  return value;
}

function optionalBody(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadInput('The body must be text.');
  }
  return value;
}

function optionalFlag(value: unknown, name: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new BadInput(`${name} must be true or false.`);
  }
  return value;
}

/** Parses the business fields of a create body. */
function draftFrom(body: Record<string, unknown>) {
  return {
    title: requireTitle(body.title),
    body: optionalBody(body.body),
    published: optionalFlag(body.published, 'published') ?? false,
    confidential: optionalFlag(body.confidential, 'confidential') ?? false,
  };
}

/**
 * Parses an edit body. Only the business fields are accepted, so a request can
 * never reassign a document's owner or rewrite its creation time.
 */
function patchFrom(body: Record<string, unknown>): LibraryDocumentPatch {
  const patch: LibraryDocumentPatch = {};
  if ('title' in body) {
    patch.title = requireTitle(body.title);
  }
  if ('body' in body) {
    patch.body = optionalBody(body.body);
  }
  const published = optionalFlag(body.published, 'published');
  if (published !== undefined) {
    patch.published = published;
  }
  const confidential = optionalFlag(body.confidential, 'confidential');
  if (confidential !== undefined) {
    patch.confidential = confidential;
  }
  if (Object.keys(patch).length === 0) {
    throw new BadInput('At least one editable field is required.');
  }
  return patch;
}

function requireUserId(body: Record<string, unknown>): string {
  const userId = body.userId;
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new BadInput('A userId is required.');
  }
  return userId;
}

export const libraryApiRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  const routes = new Hono<LibraryEnv>();
  const authentication = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const service = app.container.resolve(libraryServiceToken);

  routes.onError((error, context) => {
    if (error instanceof BadInput) {
      return badRequest(context, error.message);
    }
    throw error;
  });

  routes.use('*', authentication.required(), authorization.middleware());

  const authz = (context: Context<LibraryEnv>) => context.get('authz');

  routes.get('/documents', async (context) => {
    const policies = await policiesFor(
      authz(context),
      DOCUMENTS_RESOURCE,
      'view',
    );
    const policy = policyFor<LibraryDocument>(policies, 'documents');
    if (!policy) {
      return forbidden(context);
    }
    const window = listWindow(context);
    const { records, total } = await service.listDocuments(policy, window);
    return context.json({ data: records, meta: { total, ...window } });
  });

  routes.post('/documents', async (context) => {
    const authorizationContext = authz(context);
    const policies = await policiesFor(
      authorizationContext,
      DOCUMENTS_RESOURCE,
      'create',
    );
    const policy = policyFor<LibraryDocument>(policies, 'documents');
    if (!policy) {
      return forbidden(context);
    }
    const draft = draftFrom(await readBody(context));
    const record = await service.createDocument(
      policy,
      authorizationContext.identity.principal.id,
      draft,
    );
    return context.json({ data: record }, 201);
  });

  routes.get('/documents/:documentId', async (context) => {
    const policies = await policiesFor(
      authz(context),
      DOCUMENTS_RESOURCE,
      'view',
    );
    const policy = policyFor<LibraryDocument>(policies, 'documents');
    if (!policy) {
      return forbidden(context);
    }
    const record = await service.findDocument(
      policy,
      context.req.param('documentId'),
    );
    if (!record) {
      return notFound(context);
    }
    return context.json({ data: record });
  });

  routes.patch('/documents/:documentId', async (context) => {
    const policies = await policiesFor(
      authz(context),
      DOCUMENTS_RESOURCE,
      'edit',
    );
    const policy = policyFor<LibraryDocument>(policies, 'documents');
    if (!policy) {
      return forbidden(context);
    }
    const patch = patchFrom(await readBody(context));
    const record = await service.updateDocument(
      policy,
      context.req.param('documentId'),
      patch,
    );
    if (!record) {
      return notFound(context);
    }
    return context.json({ data: record });
  });

  routes.delete('/documents/:documentId', async (context) => {
    const policies = await policiesFor(
      authz(context),
      DOCUMENTS_RESOURCE,
      'delete',
    );
    const policy = policyFor<LibraryDocument>(policies, 'documents');
    if (!policy) {
      return forbidden(context);
    }
    const deleted = await service.deleteDocument(
      policy,
      context.req.param('documentId'),
    );
    if (!deleted) {
      return notFound(context);
    }
    return context.json({ data: { deleted: true } });
  });

  routes.get('/documents/:documentId/shares', async (context) => {
    const policies = await policiesFor(
      authz(context),
      SHARES_RESOURCE,
      'manage',
    );
    const policy = policyFor<LibraryDocumentShare>(policies, 'documentShares');
    if (!policy) {
      return forbidden(context);
    }
    const data = await service.listShares(
      policy,
      context.req.param('documentId'),
    );
    return context.json({ data });
  });

  routes.post('/documents/:documentId/shares', async (context) => {
    const authorizationContext = authz(context);
    const documentPolicies = await policiesFor(
      authorizationContext,
      DOCUMENTS_RESOURCE,
      'view',
    );
    const sharePolicies = await policiesFor(
      authorizationContext,
      SHARES_RESOURCE,
      'manage',
    );
    const documentPolicy = policyFor<LibraryDocument>(
      documentPolicies,
      'documents',
    );
    const sharePolicy = policyFor<LibraryDocumentShare>(
      sharePolicies,
      'documentShares',
    );
    if (!documentPolicy || !sharePolicy) {
      return forbidden(context);
    }
    const documentId = context.req.param('documentId');
    const document = await service.findDocument(documentPolicy, documentId);
    if (!document) {
      return notFound(context);
    }
    const userId = requireUserId(await readBody(context));
    const share = await service.createShare(sharePolicy, documentId, userId);
    return context.json({ data: share }, 201);
  });

  routes.delete('/documents/:documentId/shares/:shareId', async (context) => {
    const policies = await policiesFor(
      authz(context),
      SHARES_RESOURCE,
      'manage',
    );
    const policy = policyFor<LibraryDocumentShare>(policies, 'documentShares');
    if (!policy) {
      return forbidden(context);
    }
    const deleted = await service.deleteShare(
      policy,
      context.req.param('documentId'),
      context.req.param('shareId'),
    );
    if (!deleted) {
      return notFound(context);
    }
    return context.json({ data: { deleted: true } });
  });

  routes.get('/accounts', async (context) => {
    const policies = await policiesFor(
      authz(context),
      SHARES_RESOURCE,
      'manage',
    );
    const policy = policyFor<LibraryDocumentShare>(policies, 'documentShares');
    if (!policy) {
      return forbidden(context);
    }
    const data = await service.listAccounts();
    return context.json({ data });
  });

  router.route('/library', routes);
  return router;
});

export default [libraryApiRoutes];
