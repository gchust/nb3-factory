import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationContext,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, RepositoryError } from '@nocobase/db';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { materialsLibrary } from '../materials-resources.js';

/**
 * The composite business operation the routes authorize against. It is the
 * same resource the permission sets grant, so a colleague without `manage`
 * is refused by the server no matter what the page offers.
 */
const MATERIAL_RESOURCE = {
  type: 'composite',
  id: materialsLibrary.reference().name,
} as const;

/** An identity that bypassed grants, such as an administrator. */
const UNRESTRICTED_POLICY = {
  read: true,
  create: true,
  update: true,
  delete: true,
} as unknown as RepositoryPolicy;

/** A stored material as the API hands it to the client. */
interface MaterialRecord {
  id: number;
  title: string;
  body: string;
  confidential: boolean;
}

/** The maximum title length the `materials.title` column accepts. */
const MAX_TITLE_LENGTH = 255;
/** A body longer than this is almost certainly an upload, not a material. */
const MAX_BODY_LENGTH = 100_000;

/** Read one material's writable fields, refusing anything else. */
function readMaterialInput(body: unknown): { title: string; body: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HTTPException(400, { message: 'Expected a material payload.' });
  }
  const allowed = new Set(['title', 'body']);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new HTTPException(400, {
      message: 'A material only carries a title and a body.',
    });
  }
  const title: unknown = Reflect.get(body, 'title');
  const content: unknown = Reflect.get(body, 'body');
  if (typeof title !== 'string' || !title.trim()) {
    throw new HTTPException(400, { message: 'A material needs a title.' });
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new HTTPException(400, {
      message: 'The material title is too long.',
    });
  }
  if (typeof content !== 'string' || !content.trim()) {
    throw new HTTPException(400, { message: 'A material needs a body.' });
  }
  if (content.length > MAX_BODY_LENGTH) {
    throw new HTTPException(400, { message: 'The material body is too long.' });
  }
  return { title: title.trim(), body: content };
}

/** Parse a numeric record id from a path parameter. */
function readMaterialId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(404, { message: 'No such material.' });
  }
  return id;
}

/**
 * Authorize one business action and return the single table policy it produced.
 *
 * A denied action is a `403`. The Repository runs only under the returned
 * policy, so a colleague's read is narrowed to public records in SQL and their
 * write never reaches the table.
 */
async function materialPolicy(
  authz: AuthorizationContext,
  action: 'view' | 'manage',
): Promise<RepositoryPolicy> {
  const decision = await authz.authorize({
    resource: MATERIAL_RESOURCE,
    action,
  });
  if (decision.effect === 'deny') {
    throw new HTTPException(403, { message: 'Forbidden' });
  }
  return decision.conditions?.database?.materials ?? UNRESTRICTED_POLICY;
}

/** Map a Repository failure onto the HTTP status the client should see. */
function repositoryStatus(error: RepositoryError): ContentfulStatusCode {
  switch (error.code) {
    case 'RECORD_NOT_FOUND':
    case 'RELATION_TARGET_NOT_FOUND':
      return 404;
    case 'WRITE_FORBIDDEN':
    case 'FIELD_WRITE_FORBIDDEN':
    case 'RELATION_WRITE_FORBIDDEN':
    case 'READ_FORBIDDEN':
    case 'FIELD_READ_FORBIDDEN':
    case 'RELATION_READ_FORBIDDEN':
    case 'SCOPE_VIOLATION':
      return 403;
    case 'VERSION_CONFLICT':
    case 'MULTIPLE_RECORDS_MATCHED':
    case 'RECORD_OUTSIDE_SCOPE':
      return 409;
    case 'INVALID_POLICY':
    case 'POLICY_REQUIRED':
      return 500;
    default:
      return 500;
  }
}

/** The application's read and write surface over the `materials` collection. */
export async function createMaterialsRoutes(app: Application): Promise<Hono> {
  const authentication = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const database = app.container.resolve(databaseManagerToken);

  const router = new Hono<AuthorizationEnv>();
  router.onError((error, context) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    if (error instanceof RepositoryError) {
      return context.json(
        { code: error.code, message: error.message },
        repositoryStatus(error),
      );
    }
    throw error;
  });

  // Every route below owns its own security: authentication establishes who is
  // asking, `authz.middleware()` builds the permission context each handler
  // authorizes against. The guards are registered per exact path rather than
  // on `'*'`: this router is mounted under `/api`, so a wildcard here would
  // become `/api/*` and intercept the application's sibling API routes too.
  const guards = [
    authentication.required(),
    authz.middleware(),
    bodyLimit({ maxSize: 256 * 1024 }),
  ];
  for (const path of ['/materials', '/materials/*'] as const) {
    for (const guard of guards) {
      router.use(path, guard);
    }
  }

  router.get('/materials', async (context) => {
    const authzContext = context.get('authz');
    const records = (await database
      .repository('materials')
      .withPolicy(await materialPolicy(authzContext, 'view'))
      .findMany({
        sort: (sort) => sort.field('id').asc(),
      })) as unknown as MaterialRecord[];

    // The management decision is folded once here so the page knows whether to
    // offer editing before the user tries it. It is display only: every write
    // below re-authorizes independently.
    let canManage = true;
    try {
      await materialPolicy(authzContext, 'manage');
    } catch {
      canManage = false;
    }

    return context.json({ data: records, meta: { canManage } });
  });

  router.get('/materials/:id', async (context) => {
    const id = readMaterialId(context.req.param('id'));
    const record = (await database
      .repository('materials')
      .withPolicy(await materialPolicy(context.get('authz'), 'view'))
      .findOne({ filter: { id } })) as unknown as MaterialRecord | undefined;
    if (!record) {
      return context.json({ code: 'NOT_FOUND' }, 404);
    }
    return context.json({ data: record });
  });

  router.post('/materials', async (context) => {
    const input = readMaterialInput(await context.req.json().catch(() => null));
    // The collection declares `createdAt`/`updatedAt` NOT NULL without a
    // database default, so the writer supplies them the way the seed does.
    const now = new Date();
    const result = await database
      .repository('materials')
      .withPolicy(await materialPolicy(context.get('authz'), 'manage'))
      .createOne({ values: { ...input, createdAt: now, updatedAt: now } });
    return context.json({ data: result.record }, 201);
  });

  router.patch('/materials/:id', async (context) => {
    const id = readMaterialId(context.req.param('id'));
    const input = readMaterialInput(await context.req.json().catch(() => null));
    const result = await database
      .repository('materials')
      .withPolicy(await materialPolicy(context.get('authz'), 'manage'))
      .updateOne({
        filter: { id },
        values: { ...input, updatedAt: new Date() },
      });
    return context.json({ data: result.record });
  });

  router.delete('/materials/:id', async (context) => {
    const id = readMaterialId(context.req.param('id'));
    await database
      .repository('materials')
      .withPolicy(await materialPolicy(context.get('authz'), 'manage'))
      .deleteOne({ filter: { id } });
    return context.json({ data: { id } });
  });

  return router as unknown as Hono;
}

const materialsRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  createMaterialsRoutes,
);

export default materialsRoutes;
