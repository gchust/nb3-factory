import { Hono, type Context } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationContext,
} from '@nocobase/app-plugin-authorization/server';
import {
  databaseManagerToken,
  RepositoryError,
  type DatabaseManager,
} from '@nocobase/db';
import { MATERIALS_COLLECTION, type Material } from '../library/resources.js';

type MaterialsContext = Context;

/** The composite resource every request is authorized against; must match `server/library/resources.ts`. */
const MATERIAL_RESOURCE = {
  type: 'composite',
  id: 'library.materials',
} as const;

const NOT_FOUND_CODES = new Set([
  'RECORD_NOT_FOUND',
  'RECORD_OUTSIDE_SCOPE',
  'SCOPE_VIOLATION',
]);
const FORBIDDEN_CODES = new Set([
  'WRITE_FORBIDDEN',
  'FIELD_WRITE_FORBIDDEN',
  'POLICY_REQUIRED',
]);

function invalidInput(message: string) {
  return { code: 'INVALID_INPUT', message } as const;
}

function materialId(raw: string | undefined): string | undefined {
  if (!raw || raw.length > 64 || !/^[0-9a-fA-F-]+$/.test(raw)) return undefined;
  return raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface MaterialInput {
  title?: string;
  content?: string | null;
  published?: boolean;
  confidential?: boolean;
}

type ParsedInput =
  { values: MaterialInput } | { error: ReturnType<typeof invalidInput> };

/**
 * Validates a create or update body. `requireTitle` is true only for create; an update must change something and may
 * never change the owner, which is set by the server.
 */
function parseMaterialInput(
  input: unknown,
  requireTitle: boolean,
): ParsedInput {
  if (!isRecord(input))
    return { error: invalidInput('A JSON object body is required.') };

  const values: MaterialInput = {};

  if (requireTitle || 'title' in input) {
    const title = input.title;
    if (typeof title !== 'string' || title.trim().length === 0) {
      return { error: invalidInput('title must be a non-empty string.') };
    }
    if (title.length > 255)
      return { error: invalidInput('title must be at most 255 characters.') };
    values.title = title.trim();
  }

  if ('content' in input) {
    const content = input.content;
    if (content !== null && typeof content !== 'string') {
      return { error: invalidInput('content must be a string or null.') };
    }
    values.content = content;
  }

  for (const flag of ['published', 'confidential'] as const) {
    if (!(flag in input)) continue;
    const value = input[flag];
    if (typeof value !== 'boolean')
      return { error: invalidInput(`${flag} must be a boolean.`) };
    values[flag] = value;
  }

  const changed =
    values.title !== undefined ||
    'content' in values ||
    values.published !== undefined ||
    values.confidential !== undefined;
  if (!requireTitle && !changed) {
    return {
      error: invalidInput(
        'At least one of title, content, published or confidential is required.',
      ),
    };
  }

  return { values };
}

interface OwnerRow {
  id: string;
  name: string;
}

/** A bound policy narrows the returned fields to its allowlist, so reads come back partial. */
type MaterialRecord = Partial<Material>;

/** The GET response adds the owner's display name so the page does not render a bare user id. */
type MaterialWithOwner = MaterialRecord & { ownerName?: string };

/**
 * Resolves the display name of every owner in one query. The read is deliberately direct: the library endpoint has
 * already authorized the caller, and the account name is not a business record the caller's material policy governs.
 */
async function attachOwnerNames(
  database: DatabaseManager,
  records: readonly MaterialRecord[],
): Promise<MaterialWithOwner[]> {
  const ownerIds = [
    ...new Set(
      records
        .map((record) => record.ownerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ownerIds.length === 0) return [...records];

  const rows = await database
    .query()
    .selectFrom('user')
    .select(['id', 'name'])
    .where('id', 'in', ownerIds)
    .execute<OwnerRow>();
  const names = new Map(rows.map((row) => [String(row.id), row.name]));

  return records.map((record) => {
    const ownerName = record.ownerId ? names.get(record.ownerId) : undefined;
    return ownerName ? { ...record, ownerName } : { ...record };
  });
}

function currentUserId(context: MaterialsContext): string | undefined {
  const session = context.get('auth') as
    { user?: { id?: string | number } } | null | undefined;
  const id = session?.user?.id;
  return id === undefined || id === null ? undefined : String(id);
}

/** `authz.middleware()` sets this; the route's default Hono env does not declare it. */
function authorizationContext(
  context: MaterialsContext,
): AuthorizationContext | undefined {
  return context.get('authz') as AuthorizationContext | undefined;
}

function repositoryErrorResponse(context: MaterialsContext, error: unknown) {
  if (error instanceof RepositoryError) {
    if (NOT_FOUND_CODES.has(error.code))
      return context.json({ code: 'NOT_FOUND' }, 404);
    if (FORBIDDEN_CODES.has(error.code))
      return context.json({ code: 'FORBIDDEN' }, 403);
  }
  throw error;
}

/**
 * The material library's HTTP surface.
 *
 * The endpoints never decide access themselves: every request authorizes the composite operation first and runs the
 * repository under the policy that decision composed, so this API, the authorization workspace and the client page all
 * enforce the same model. `ownerId` is assigned by the server and never accepted from the client, so asking for a
 * temporary share can never turn into an edit grant.
 */
export const materialRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);

    const guard = [auth.required(), authz.middleware()] as const;
    router.use('/materials', ...guard);
    router.use('/materials/*', ...guard);

    const authorize = async (
      context: MaterialsContext,
      action: 'view' | 'create' | 'edit' | 'delete',
    ) => {
      const current = authorizationContext(context);
      if (!current) return undefined;
      const decision = await current.authorize({
        resource: MATERIAL_RESOURCE,
        action,
      });
      const policy = decision.conditions?.database?.[MATERIALS_COLLECTION];
      if (decision.effect === 'deny' || !policy) return undefined;
      return policy;
    };

    router.get('/materials', async (context) => {
      const policy = await authorize(context, 'view');
      if (!policy) return context.json({ code: 'FORBIDDEN' }, 403);

      const records = await database
        .repository<Material>(MATERIALS_COLLECTION)
        .withPolicy(policy)
        .findMany();
      const sorted = [...records].sort((a, b) => {
        const byCreated = String(b.createdAt).localeCompare(
          String(a.createdAt),
        );
        return byCreated !== 0
          ? byCreated
          : String(b.id).localeCompare(String(a.id));
      });
      return context.json({ data: await attachOwnerNames(database, sorted) });
    });

    router.post('/materials', async (context) => {
      const policy = await authorize(context, 'create');
      if (!policy) return context.json({ code: 'FORBIDDEN' }, 403);

      const ownerId = currentUserId(context);
      if (!ownerId) return context.json({ code: 'UNAUTHORIZED' }, 401);

      const parsed = parseMaterialInput(
        await context.req.json().catch(() => undefined),
        true,
      );
      if ('error' in parsed) return context.json(parsed.error, 400);

      const now = new Date();
      const { record } = await database
        .repository<Material>(MATERIALS_COLLECTION)
        .withPolicy(policy)
        .createOne({
          values: {
            id: crypto.randomUUID(),
            title: parsed.values.title as string,
            content: parsed.values.content ?? null,
            ownerId,
            published: parsed.values.published ?? false,
            confidential: parsed.values.confidential ?? false,
            createdAt: now,
            updatedAt: now,
          },
        });
      return context.json({ data: record }, 201);
    });

    router.patch('/materials/:id', async (context) => {
      const policy = await authorize(context, 'edit');
      if (!policy) return context.json({ code: 'FORBIDDEN' }, 403);

      const id = materialId(context.req.param('id'));
      if (id === undefined) return context.json({ code: 'NOT_FOUND' }, 404);

      const parsed = parseMaterialInput(
        await context.req.json().catch(() => undefined),
        false,
      );
      if ('error' in parsed) return context.json(parsed.error, 400);

      try {
        const { record } = await database
          .repository<Material>(MATERIALS_COLLECTION)
          .withPolicy(policy)
          .updateOne({
            filter: { id },
            values: { ...parsed.values, updatedAt: new Date() },
          });
        return context.json({ data: record });
      } catch (error) {
        return repositoryErrorResponse(context, error);
      }
    });

    router.delete('/materials/:id', async (context) => {
      const policy = await authorize(context, 'delete');
      if (!policy) return context.json({ code: 'FORBIDDEN' }, 403);

      const id = materialId(context.req.param('id'));
      if (id === undefined) return context.json({ code: 'NOT_FOUND' }, 404);

      try {
        await database
          .repository<Material>(MATERIALS_COLLECTION)
          .withPolicy(policy)
          .deleteOne({ filter: { id } });
        return context.body(null, 204);
      } catch (error) {
        return repositoryErrorResponse(context, error);
      }
    });

    return router;
  });
