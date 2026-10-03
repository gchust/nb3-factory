import type {
  DatabaseManager,
  Repository,
  RepositoryPolicy,
} from '@nocobase/db';
import type { AuthorizationContext } from '@nocobase/authorization/core';

export interface ResolvedPolicy {
  /** `deny` when nothing is granted; `permit` for unrestricted; `conditional` with a row policy. */
  effect: 'permit' | 'conditional' | 'deny';
  policy?: RepositoryPolicy;
}

/**
 * Resolves one composite action to the row policy of a single collection.
 *
 * The composite action is the unit the permission sets grant; the collection is
 * the table its data scope targets. A `permit` is unrestricted access, a
 * `conditional` carries the policy that filters rows, and a `deny` blocks the
 * request entirely.
 */
export async function resolvePolicy(
  context: AuthorizationContext,
  resource: string,
  action: string,
  collection: string,
): Promise<ResolvedPolicy> {
  const decision = await context.authorize({
    resource: { type: 'composite', id: resource },
    action,
  });
  if (decision.effect === 'deny') {
    return { effect: 'deny' };
  }
  if (decision.effect === 'permit') {
    return { effect: 'permit' };
  }
  const policy = decision.conditions?.database?.[collection];
  if (!policy) {
    return { effect: 'deny' };
  }
  return { effect: 'conditional', policy };
}

/**
 * Whether the caller holds the composite action *at all*, ignoring which
 * collection its data scopes name.
 *
 * `attach` is the one order action whose grants target the attachment file
 * collections rather than `serviceOrders`, so `resolvePolicy(..., 'attach',
 * 'serviceOrders')` finds no row policy and reports a deny even though the
 * caller may attach. This answers the capability question from the composite
 * decision itself; the order-level row scope is resolved separately from the
 * caller's `view` policy.
 */
export async function hasCapability(
  context: AuthorizationContext,
  resource: string,
  action: string,
): Promise<boolean> {
  const decision = await context.authorize({
    resource: { type: 'composite', id: resource },
    action,
  });
  return decision.effect !== 'deny';
}

/** Binds a repository to a resolved policy, or leaves it unrestricted for a permit. */
export function scopedRepository(
  database: DatabaseManager,
  collection: string,
  resolved: ResolvedPolicy,
): Repository {
  const repository = database.repository(collection);
  const bound = resolved.policy
    ? repository.withPolicy(resolved.policy)
    : repository;
  return bound as unknown as Repository;
}
