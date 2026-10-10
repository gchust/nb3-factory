import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { driveManagerToken } from '@nocobase/app-server/drive';
import type {
  DatabaseManager,
  RepositoryOperations,
  RepositoryPolicy,
} from '@nocobase/db';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import type { WorkflowServiceContract } from '@nocobase/app-plugin-workflow/server';
import type { ServiceToken } from '@nocobase/service-provider';

import { ServiceError } from './errors.js';

/** The application's drive manager, derived from its own service token. */
export type AppDriveManager =
  typeof driveManagerToken extends ServiceToken<infer T> ? T : never;

/**
 * The shape a run handler or a scheduler target receives, and the minimal
 * logging surface business code needs. Declared structurally so server code
 * does not have to depend on the logging package's concrete type.
 */
export interface ServiceLogger {
  debug?(data: unknown, message?: string): void;
  info?(data: unknown, message?: string): void;
  warn?(data: unknown, message?: string): void;
  error?(data: unknown, message?: string): void;
}

/** The environment every business service needs, independent of HTTP. */
export interface ServiceRuntime {
  readonly database: DatabaseManager;
  readonly notification?: NotificationService;
  readonly drive?: AppDriveManager;
  readonly logger?: ServiceLogger;
  /**
   * The workflow service when the workflow plugin is registered.
   *
   * Business code triggers a workflow through it and falls back to the direct
   * transition when it is absent, so the app works whether or not automation
   * is installed.
   */
  readonly workflow?: WorkflowServiceContract;
}

/** A runtime plus the permission context of the request that reached it. */
export interface RequestServiceContext extends ServiceRuntime {
  readonly authz: AuthorizationContext;
  readonly actorId: string;
  readonly policies: Readonly<Record<string, RepositoryPolicy>>;
}

/** The record scopes the composite check resolved, keyed by collection. */
export type CompositePolicies = Readonly<Record<string, RepositoryPolicy>>;

/**
 * Runs a composite authorization check for the current identity and returns the
 * per-collection policies it produced.
 *
 * `permit` and `conditional` both pass: a conditional decision carries the data
 * scopes that limit which rows the operation may touch. Only `deny` fails.
 */
export async function authorizeComposite(
  authz: AuthorizationContext,
  resourceId: string,
  action: string,
): Promise<CompositePolicies> {
  const decision = await authz.authorize({
    resource: { type: 'composite', id: resourceId },
    action,
  });
  if (decision.effect === 'deny') {
    throw new ServiceError(
      'PERMISSION_DENIED',
      'AUTHORIZATION_DENIED',
      `The ${action} action on ${resourceId} is not permitted.`,
    );
  }
  return decision.conditions?.database ?? {};
}

/**
 * Resolves a composite check that more than one action may answer.
 *
 * Reading the order list is permitted either by the full `view` action or by
 * the narrower `viewSummary` an observer holds. Trying the actions in order and
 * keeping the first decision that is not `deny` is how one endpoint serves both
 * callers. `permit` and `conditional` both count as allowed; the failure is only
 * reported when every candidate denied it.
 */
export async function authorizeCompositeAction(
  authz: AuthorizationContext,
  resourceId: string,
  actions: readonly string[],
): Promise<{ action: string; policies: CompositePolicies }> {
  const reasons: string[] = [];
  for (const action of actions) {
    const decision = await authz.authorize({
      resource: { type: 'composite', id: resourceId },
      action,
    });
    if (decision.effect !== 'deny') {
      return { action, policies: decision.conditions?.database ?? {} };
    }
    reasons.push(...decision.reasons.map((reason) => reason.message));
  }
  throw new ServiceError(
    'PERMISSION_DENIED',
    'AUTHORIZATION_DENIED',
    `None of [${actions.join(', ')}] on ${resourceId} is permitted. ${reasons.join(' ')}`.trim(),
  );
}

/**
 * A repository limited by the data scope the composite check resolved.
 *
 * The policy a decision carries is the framework's own `RepositoryPolicy`, whose
 * `TRecord` parameter is erased by the time it reaches application code (the
 * scopes are read out of a JSON-ish conditions object). Binding it to the row
 * type the caller selected is a genuine type/implementation gap, not a bypass of
 * a project rule, so it is asserted once here and every service then calls an
 * ordinary `RepositoryOperations`.
 */
export function scopedRepository<TRecord extends object>(
  database: DatabaseManager,
  collection: string,
  policies: CompositePolicies,
): RepositoryOperations<TRecord> {
  const repository = database.repository<TRecord>(collection);
  const policy = policies[collection];
  if (!policy) {
    return repository;
  }
  const bound = repository.withPolicy(policy as never);
  return bound;
}

/** `true` when the principal is a signed-in user rather than anonymous. */
export function isAuthenticatedActor(authz: AuthorizationContext): boolean {
  return authz.identity.principal.type === 'user';
}
