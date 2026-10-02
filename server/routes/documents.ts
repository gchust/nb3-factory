import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRepositoryApiRoutes,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { MiddlewareHandler } from 'hono';

import { materialsResource } from '../documents-resources.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TITLE = 255;
const MAX_CONTENT = 20_000;

/**
 * Generated Repository CRUD for the documents collection. Every action is
 * bound to a composite action; the authorization middleware intersects its
 * decision with this static policy, so a request can never widen fields or
 * record range beyond what the caller's permission set grants.
 */
const repositoryRoutes = defineRepositoryApiRoutes({
  repositories: [
    {
      name: 'documentsMaterials',
      collection: 'documents',
      policy: {
        read: { scope: true, fields: ['id', 'title', 'content'] },
        create: { scope: true, fields: ['id', 'title', 'content'] },
        update: { scope: true, fields: ['title', 'content'] },
        delete: { scope: true },
      },
      actions: {
        findMany: { maxLimit: 200 },
        findOne: {},
        count: {},
        createOne: {},
        updateOne: {},
        deleteOne: {},
      },
    },
  ],
});

function invalid(message: string): never {
  throw new HTTPException(400, { message });
}

function readValues(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalid('Expected a JSON object');
  }
  const values: unknown = Reflect.get(body, 'values');
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    invalid('values must be an object');
  }
  return values as Record<string, unknown>;
}

function assertText(value: unknown, field: string, max: number): void {
  if (typeof value !== 'string' || !value.trim().length || value.length > max) {
    invalid(`${field} must be a non-empty string of at most ${max} characters`);
  }
}

async function parseBody(
  context: Parameters<MiddlewareHandler<AuthorizationEnv>>[0],
) {
  return context.req.raw
    .clone()
    .json()
    .catch(() => invalid('Invalid JSON'));
}

const validateCreate: MiddlewareHandler<AuthorizationEnv> = async (
  context,
  next,
) => {
  const values = readValues(await parseBody(context));
  const keys = Object.keys(values);
  for (const key of keys) {
    if (!['id', 'title', 'content'].includes(key)) {
      invalid(`Unsupported document field: ${key}`);
    }
  }
  if (typeof values.id !== 'string' || !ID_PATTERN.test(values.id)) {
    invalid('id must match [A-Za-z0-9_-]{1,64}');
  }
  assertText(values.title, 'title', MAX_TITLE);
  assertText(values.content, 'content', MAX_CONTENT);
  await next();
};

const validateUpdate: MiddlewareHandler<AuthorizationEnv> = async (
  context,
  next,
) => {
  const values = readValues(await parseBody(context));
  const keys = Object.keys(values);
  if (!keys.length) {
    invalid('Expected at least one field to update');
  }
  for (const key of keys) {
    if (!['title', 'content'].includes(key)) {
      invalid(`Unsupported document field: ${key}`);
    }
  }
  if (values.title !== undefined) {
    assertText(values.title, 'title', MAX_TITLE);
  }
  if (values.content !== undefined) {
    assertText(values.content, 'content', MAX_CONTENT);
  }
  await next();
};

/**
 * The documents API: authentication plus the composite authorization
 * middleware, mounted on an isolated router so nothing leaks into other
 * contributions.
 *
 * The middleware is bound to each Repository action path rather than a
 * wildcard: a catch-all here would answer every unregistered `/api/*` request
 * with 401 and stop it reaching the SPA fallback, even though this router owns
 * only the documents actions.
 */
const DOCUMENT_ACTIONS = [
  'findMany',
  'findOne',
  'count',
  'createOne',
  'updateOne',
  'deleteOne',
] as const;

const documentsRoutes = defineApiRoutes<Application>(async (app) => {
  const authz = app.container.resolve(authorizationToken);
  const router = new Hono<AuthorizationEnv>();
  const requireAuthentication = app.container
    .resolve(authenticationToken)
    .required();
  const requireRepositoryAccess = authz.database.authorizeRepository({
    repository: 'documentsMaterials',
    resource: materialsResource.reference(),
    actions: {
      findMany: 'view',
      findOne: 'view',
      count: 'view',
      createOne: 'manage',
      updateOne: 'manage',
      deleteOne: 'manage',
    },
  });

  for (const action of DOCUMENT_ACTIONS) {
    router.use(
      `/documentsMaterials:${action}`,
      requireAuthentication,
      requireRepositoryAccess,
    );
  }

  router.use('/documentsMaterials:createOne', validateCreate);
  router.use('/documentsMaterials:updateOne', validateUpdate);

  router.route('/', await repositoryRoutes.createRouter(app));
  return new Hono().route('/', router);
});

export default documentsRoutes;
