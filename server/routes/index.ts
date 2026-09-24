import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationScope,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import {
  databaseManagerToken,
  type Repository,
  type RepositoryPolicy,
} from '@nocobase/db';
import { Hono, type Context } from 'hono';

import {
  MATERIALS_COLLECTION,
  MATERIAL_RESOURCE,
  type MaterialRow,
} from '../library/authorization.js';

type MaterialCreate = MaterialRow;
type MaterialUpdate = Partial<
  Pick<
    MaterialRow,
    'title' | 'body' | 'published' | 'confidential' | 'updatedAt'
  >
>;
type MaterialRepository = Repository<
  MaterialRow,
  MaterialCreate,
  MaterialUpdate
>;

/**
 * A small CRUD API for the library. Every path enforces its own security:
 * `authentication.required()` establishes the session, `authorization.middleware()`
 * resolves it into a request scope, and each handler authorizes the matching
 * business action before touching the Repository with its Policy.
 */
export function createLibraryRoutes(app: Application): Hono {
  const router = new Hono();
  const authentication = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const database = app.container.resolve(databaseManagerToken);

  const materials = new Hono<AuthEnv>();
  // Scoped to this isolated sub-router, so the middleware never leaks into a
  // contribution mounted after this one.
  materials.use('*', authentication.required());
  materials.use('*', authorization.middleware());

  const repositoryFor = async (
    context: Context,
    action: 'view' | 'create' | 'edit' | 'delete',
  ): Promise<MaterialRepository | undefined> => {
    const authz = context.get('authz') as AuthorizationScope;
    const decision = await authz.authorize({
      resource: MATERIAL_RESOURCE,
      action,
    });
    if (decision.effect === 'deny') {
      return undefined;
    }
    const conditions = decision.conditions as
      | { database?: Readonly<Record<string, RepositoryPolicy<MaterialRow>>> }
      | undefined;
    const policy = conditions?.database?.[MATERIALS_COLLECTION];
    const repository = database
      .connection()
      .repository<MaterialRow, MaterialCreate, MaterialUpdate>(
        MATERIALS_COLLECTION,
      );
    // An unrestricted identity returns a Policy with an open scope, so the
    // scoped path covers both cases; the raw repository is only a guard for a
    // decision that carried no database conditions at all.
    return (policy
      ? repository.withPolicy(policy)
      : repository) as unknown as MaterialRepository;
  };

  materials.get('/', async (context) => {
    const repository = await repositoryFor(context, 'view');
    if (!repository) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    try {
      const records = await repository.findMany();
      // The permission snapshot the client checks with `useCan` omits actions
      // that carry a record scope, so the list response states the same
      // eligibility the action endpoints enforce: a collection-wide create
      // capability and a per-row edit/delete flag proved with each action's own
      // Policy. The page only renders what the server reports, and every
      // mutation is authorized again on its own path.
      const [editRepository, deleteRepository, createRepository] =
        await Promise.all([
          repositoryFor(context, 'edit'),
          repositoryFor(context, 'delete'),
          repositoryFor(context, 'create'),
        ]);
      const data = await Promise.all(
        records.map(async (record) => ({
          ...record,
          canEdit: await rowIsInScope(editRepository, record.id),
          canDelete: await rowIsInScope(deleteRepository, record.id),
        })),
      );
      return context.json({
        data,
        meta: { canCreate: createRepository !== undefined },
      });
    } catch (error) {
      return respondToRepositoryError(context, error);
    }
  });

  materials.post('/', async (context) => {
    const repository = await repositoryFor(context, 'create');
    if (!repository) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const session = context.get('auth') as
      { user?: { id?: string } } | null | undefined;
    const ownerId = session?.user?.id;
    if (!ownerId) {
      return context.json({ code: 'UNAUTHENTICATED' }, 401);
    }
    const payload = await readJson(context);
    const now = new Date();
    try {
      const result = await repository.createOne({
        values: {
          id: crypto.randomUUID(),
          title: typeof payload.title === 'string' ? payload.title : 'Untitled',
          body: typeof payload.body === 'string' ? payload.body : null,
          ownerId,
          published: payload.published === true,
          confidential: payload.confidential === true,
          createdAt: now,
          updatedAt: now,
        },
      });
      return context.json({ data: result.record }, 201);
    } catch (error) {
      return respondToRepositoryError(context, error);
    }
  });

  materials.patch('/:id', async (context) => {
    const repository = await repositoryFor(context, 'edit');
    if (!repository) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const id = context.req.param('id');
    const payload = await readJson(context);
    const values: MaterialUpdate = { updatedAt: new Date() };
    if (typeof payload.title === 'string') values.title = payload.title;
    if (payload.body === null || typeof payload.body === 'string') {
      values.body = payload.body;
    }
    if (typeof payload.published === 'boolean') {
      values.published = payload.published;
    }
    if (typeof payload.confidential === 'boolean') {
      values.confidential = payload.confidential;
    }
    try {
      const result = await repository.updateOne({
        filter: (filter) => filter.string('id').eq(id),
        values,
      });
      return context.json({ data: result.record });
    } catch (error) {
      return respondToRepositoryError(context, error);
    }
  });

  materials.delete('/:id', async (context) => {
    const repository = await repositoryFor(context, 'delete');
    if (!repository) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    const id = context.req.param('id');
    try {
      await repository.deleteOne({
        filter: (filter) => filter.string('id').eq(id),
      });
      return context.json({ data: { id } });
    } catch (error) {
      return respondToRepositoryError(context, error);
    }
  });

  router.route('/library/materials', materials);
  return router;
}

/**
 * Whether one row id falls inside the scope the action's Policy already
 * enforces. A missing repository means the action itself was denied, and a
 * refused read means the row is out of scope, so both answer `false` instead of
 * failing the list request.
 */
async function rowIsInScope(
  repository: MaterialRepository | undefined,
  id: string,
): Promise<boolean> {
  if (!repository) return false;
  try {
    return await repository.exists({
      filter: (filter) => filter.string('id').eq(id),
    });
  } catch {
    return false;
  }
}

/** Reads a JSON object body, treating anything malformed as an empty payload. */
async function readJson(context: Context): Promise<Record<string, unknown>> {
  try {
    const value = (await context.req.json()) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// Repository errors are read by their `code` rather than by class identity so
// the route does not depend on `@nocobase/repository-input`'s internal error
// export path.
const REPOSITORY_ERROR_STATUS: Readonly<Record<string, number>> = {
  RECORD_NOT_FOUND: 404,
  RECORD_OUTSIDE_SCOPE: 404,
  SCOPE_VIOLATION: 404,
  READ_FORBIDDEN: 403,
  WRITE_FORBIDDEN: 403,
  FIELD_WRITE_FORBIDDEN: 403,
};

function respondToRepositoryError(
  context: Context,
  error: unknown,
): Response | Promise<Response> {
  const code =
    error && typeof error === 'object'
      ? (error as { code?: unknown }).code
      : undefined;
  if (typeof code === 'string') {
    const status = REPOSITORY_ERROR_STATUS[code];
    if (status === 403) return context.json({ code: 'FORBIDDEN' }, 403);
    if (status === 404) return context.json({ code: 'NOT_FOUND' }, 404);
  }
  throw error;
}

const routes: readonly AppRouteContribution<Application>[] = [
  defineApiRoutes((app) => createLibraryRoutes(app)),
];

export default routes;
