import type {
  AuthorizationContext,
  Principal,
} from '@nocobase/authorization/core';
import type {
  DatabaseManager,
  RepositoryPolicy,
  ScopedDatabaseConnection,
} from '@nocobase/db';

import { forbidden } from './errors.js';

/**
 * The collection-keyed policies a composite decision produced.
 *
 * Every business operation is authorized exactly once, through the composite action that names it, and the
 * resulting policies are bound to the repositories the operation uses. A repository that runs without a bound
 * policy is unrestricted, so the services in this directory only ever take a repository from a scoped
 * connection produced by `authorizeComposite` or `policyForCollections`.
 */
export type ServicePolicies = Readonly<Record<string, RepositoryPolicy>>;

/**
 * Authorize one composite action and return the policies of every collection it touches.
 *
 * A denied composite has no permissions to bind, so it is refused here. A granted action whose data scope
 * selects nothing still returns a policy that matches no rows: reads come back empty rather than forbidden,
 * which is what an engineer in no group should see.
 */
export async function authorizeComposite(
  context: AuthorizationContext,
  resource: string,
  action: string,
): Promise<ServicePolicies> {
  const decision = await context.authorize({
    resource: { type: 'composite', id: resource },
    action,
  });
  if (decision.effect === 'deny') throw forbidden();
  return decision.conditions?.database ?? {};
}

/** Bind the policies of one operation to the request's principal. */
export function scopedConnection(
  database: DatabaseManager,
  principal: Principal,
  policies: ServicePolicies,
): ScopedDatabaseConnection {
  return database.connection().withPolicies(policies, principal);
}

/** Fold the CRUD decisions of a collection into one policy, for pages that only read it. */
export async function policyForCollection(
  policies: Readonly<
    Record<
      string,
      RepositoryPolicy | ((principal: unknown) => RepositoryPolicy)
    >
  >,
  collection: string,
  principal: Principal,
): Promise<RepositoryPolicy> {
  const policy = policies[collection];
  if (!policy) throw forbidden();
  return typeof policy === 'function' ? policy(principal) : policy;
}
