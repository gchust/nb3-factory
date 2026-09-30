import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import type {
  RepositoryMutationScalarValue,
  RepositoryPolicy,
} from '@nocobase/db';

/**
 * Shared plumbing for the after-sales service routes. A route authorizes the
 * business action once, then binds the returned per-collection Repository
 * Policy to every read and write, so the database — not the handler — enforces
 * the caller's data scope.
 */

export type ServiceEnv = AuthEnv & AuthorizationEnv;
export type ServiceContext = Context<ServiceEnv>;

export type MutationValues = Record<string, RepositoryMutationScalarValue>;

export interface Actor {
  id: string;
  name?: string;
}

export function actorOf(context: ServiceContext): Actor {
  const session = context.get('auth');
  const user = session?.user;
  const actor: Actor = { id: String(user?.id ?? '') };
  if (user?.name) actor.name = String(user.name);
  return actor;
}

/**
 * Authorize one composite business action and return its database policies.
 * A denied decision, or a decision that carries no policy for the tables the
 * action needs, is a 403 — never a silent fall-through to an unrestricted
 * repository.
 */
export async function authorizeAction(
  context: ServiceContext,
  resourceId: string,
  action: string,
): Promise<Readonly<Record<string, RepositoryPolicy>>> {
  const decision = await context.get('authz').authorize({
    resource: { type: 'composite', id: resourceId },
    action,
  });
  const database = decision.conditions?.database;
  if (
    decision.effect === 'deny' ||
    !database ||
    Object.keys(database).length === 0
  ) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }
  return database;
}

/**
 * The non-throwing form of {@link authorizeAction}: whether the session holds a
 * usable grant for one composite action. Callers use it to build a capability
 * map; the action endpoints still authorize with `authorizeAction`, so a
 * decision reported here is never the enforcement point.
 */
export async function canAuthorizeAction(
  context: ServiceContext,
  resourceId: string,
  action: string,
): Promise<boolean> {
  try {
    await authorizeAction(context, resourceId, action);
    return true;
  } catch {
    return false;
  }
}

export function requirePolicy(
  policies: Readonly<Record<string, RepositoryPolicy>>,
  collection: string,
): RepositoryPolicy {
  const policy = policies[collection];
  if (!policy) throw new HTTPException(403, { message: 'Forbidden' });
  return policy;
}

export async function jsonBody(
  context: ServiceContext,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HTTPException(400, { message: 'A JSON object is required' });
  }
  return body as Record<string, unknown>;
}

export function requiredText(
  body: Record<string, unknown>,
  key: string,
  max = 2000,
): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HTTPException(400, { message: `${key} is required` });
  }
  if (value.length > max) {
    throw new HTTPException(400, { message: `${key} is too long` });
  }
  return value;
}

export function optionalText(
  body: Record<string, unknown>,
  key: string,
  max = 20000,
): string | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new HTTPException(400, { message: `${key} must be a string` });
  }
  if (value.length > max) {
    throw new HTTPException(400, { message: `${key} is too long` });
  }
  return value;
}

export function requiredInteger(
  body: Record<string, unknown>,
  key: string,
): number {
  const value = body[key];
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed)) {
    throw new HTTPException(400, { message: `${key} must be an integer` });
  }
  return parsed;
}

export function optionalInteger(
  body: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') return undefined;
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed)) {
    throw new HTTPException(400, { message: `${key} must be an integer` });
  }
  return parsed;
}

export function optionalBoolean(
  body: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new HTTPException(400, { message: `${key} must be a boolean` });
}

/** Copy the listed keys of a request body into Repository mutation values. */
export function pickText(
  body: Record<string, unknown>,
  fields: readonly string[],
  max = 20000,
): MutationValues {
  const values: MutationValues = {};
  for (const field of fields) {
    const value = optionalText(body, field, max);
    if (value !== undefined) values[field] = value;
  }
  return values;
}

export function numericParam(context: ServiceContext, name = 'id'): number {
  const parsed = Number(context.req.param(name));
  if (!Number.isInteger(parsed)) {
    throw new HTTPException(400, { message: `${name} must be an integer` });
  }
  return parsed;
}

export function queryValue(
  context: ServiceContext,
  name: string,
): string | undefined {
  const value = context.req.query(name);
  return value === undefined || value === '' ? undefined : value;
}

export function queryInteger(
  context: ServiceContext,
  name: string,
): number | undefined {
  const raw = queryValue(context, name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new HTTPException(400, { message: `${name} must be an integer` });
  }
  return parsed;
}

export function queryBoolean(
  context: ServiceContext,
  name: string,
): boolean | undefined {
  const raw = queryValue(context, name);
  if (raw === undefined) return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new HTTPException(400, { message: `${name} must be a boolean` });
}

export function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function nowIso(): string {
  return new Date().toISOString();
}
