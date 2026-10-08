import type { Application } from '@nocobase/app-server/application';
import { ApiError } from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { RepositoryPolicy } from '@nocobase/db';
import type { Context } from 'hono';
import { TicketServiceError } from '../service/ticket-service.js';

export interface SessionActor {
  id: string;
  name: string;
}

/** The signed-in user, or a standard 401 when the request carries no session. */
export async function requireActor(
  app: Application,
  context: Context,
): Promise<SessionActor> {
  const auth = app.container.resolve(authenticationToken);
  const session = await auth.getSession(new Headers(context.req.raw.headers));
  if (!session) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'SESSION_REQUIRED',
      domain: 'service',
      message: 'A signed-in session is required.',
    });
  }
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email,
  };
}

/** The authorization checks for one signed-in user. */
export function authorizationFor(
  app: Application,
  userId: string,
): AuthorizationContext {
  return app.container
    .resolve(authorizationToken)
    .for({ principal: { type: 'user', id: userId } });
}

/** Whether the user holds the unrestricted set or the supervisor job set. */
export async function isSupervisor(
  app: Application,
  userId: string,
): Promise<boolean> {
  const authz = app.container.resolve(authorizationToken);
  const effective = await authz.permissionSets.getEffective({
    principal: { type: 'user', id: userId },
  });
  return effective.some(
    (set) => set.key === 'service-supervisor' || set.key === 'root',
  );
}

export async function requireSupervisor(
  app: Application,
  userId: string,
): Promise<void> {
  if (!(await isSupervisor(app, userId))) {
    throw new ApiError({
      status: 'PERMISSION_DENIED',
      reason: 'SUPERVISOR_REQUIRED',
      domain: 'service',
      message: 'This operation is limited to service supervisors.',
    });
  }
}

/** The permission-set keys the signed-in user currently holds. */
export async function permissionSetsFor(
  app: Application,
  userId: string,
): Promise<string[]> {
  const authz = app.container.resolve(authorizationToken);
  const effective = await authz.permissionSets.getEffective({
    principal: { type: 'user', id: userId },
  });
  return effective.map((set) => set.key);
}

/** The Repository Policy the signed-in user holds over one Collection. */
export async function policyFor(
  app: Application,
  collection: string,
  authorization: AuthorizationContext,
  operation?: { resource: string; action: string },
): Promise<RepositoryPolicy> {
  const authz = app.container.resolve(authorizationToken);
  return authz.database.policyFor(collection, authorization, operation);
}

/** Fail the request unless the user may perform the named Collection action. */
export async function requireCollectionAction(
  app: Application,
  userId: string,
  collection: string,
  action: string,
): Promise<void> {
  const decision = await authorizationFor(app, userId).authorize({
    resource: { type: 'database.collection', id: collection },
    action,
  });
  // A collection grant that carries field restrictions or a record scope
  // resolves to `conditional`, not `permit`, and the Repository Policy still
  // applies the condition to every query. Only `deny` is a refusal; `require`
  // would wrongly reject the conditional case.
  if (decision.effect === 'deny') {
    throw new ApiError({
      status: 'PERMISSION_DENIED',
      reason: 'AUTHORIZATION_DENIED',
      domain: 'authorization',
      message: `The signed-in user may not ${action} ${collection}.`,
      metadata: { reasons: decision.reasons },
    });
  }
}

/** Translate a domain service failure into the standard API error body. */
export function serviceError(error: unknown): never {
  if (error instanceof TicketServiceError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 'NOT_FOUND'
        : error.code === 'FORBIDDEN'
          ? 'PERMISSION_DENIED'
          : error.code === 'CONFLICT'
            ? 'ALREADY_EXISTS'
            : error.code === 'INVALID_STATE'
              ? 'FAILED_PRECONDITION'
              : 'INVALID_ARGUMENT';
    throw new ApiError({
      status,
      reason:
        typeof error.details?.reason === 'string'
          ? error.details.reason
          : `SERVICE_${error.code}`,
      domain: 'service',
      message: error.message,
      metadata: error.details,
    });
  }
  throw error;
}
