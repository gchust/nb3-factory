import type {
  AuthorizationContext,
  AuthorizationDecision,
  CompositeResourceConditions,
} from '@nocobase/authorization/core';
import type { RepositoryPolicy } from '@nocobase/db';

import { forbidden } from './errors.js';

// Thin domain-facing wrapper around the authorization context. A service never reaches into Hono; it asks for one
// composite decision and binds the resulting per-collection policies. A decision without a policy for a collection the
// operation touches is a denial, not a fallback to unrestricted access.
export type CompositeDecision =
  AuthorizationDecision<CompositeResourceConditions>;

export async function checkComposite(
  authorization: AuthorizationContext,
  resource: string,
  action: string,
): Promise<CompositeDecision> {
  return authorization.authorize({
    resource: { type: 'composite', id: resource },
    action,
  });
}

/** The database policies the decision grants, keyed by collection name. */
export function decisionPolicies(
  decision: CompositeDecision,
): Readonly<Record<string, RepositoryPolicy>> {
  if (decision.effect === 'deny') {
    throw forbidden('Authorization denied for this operation');
  }
  return decision.conditions?.database ?? {};
}

/**
 * The policies for exactly the collections the caller is about to read or write. Missing any one of them means the
 * identity has no grant that reaches it, so the operation is refused rather than run against the whole table.
 */
export function requirePolicies(
  decision: CompositeDecision,
  collections: readonly string[],
): Record<string, RepositoryPolicy> {
  const policies = decisionPolicies(decision);
  const selected: Record<string, RepositoryPolicy> = {};
  for (const collection of collections) {
    const policy = policies[collection];
    if (!policy) {
      throw forbidden(
        `Authorization does not grant access to ${collection} for this operation`,
      );
    }
    selected[collection] = policy;
  }
  return selected;
}
