import type {
  AuthorizationContext,
  AuthorizationEnv,
} from '@nocobase/authorization/core';
import type { RepositoryPolicy } from '@nocobase/db';
import type { Context } from 'hono';

export type PolicyMap = Readonly<Record<string, RepositoryPolicy>>;

export interface AccessResult {
  readonly policies: PolicyMap;
}

/**
 * Authorize one composite business action for the current request and return
 * the per-collection policies the action produced. Routes call this before
 * touching data; a denied decision means no access.
 */
export async function authorize<E extends AuthorizationEnv>(
  context: Context<E>,
  resourceId: string,
  action: string,
): Promise<AccessResult | undefined> {
  const authz: AuthorizationContext = context.get('authz');
  const decision = await authz.authorize({
    resource: { type: 'composite', id: resourceId },
    action,
  });
  if (decision.effect === 'deny') {
    return undefined;
  }
  // A `permit` decision carries no conditions; the action is unconditionally
  // allowed for this identity. A `conditional` decision carries the database
  // policy set the action produced.
  return { policies: decision.conditions?.database ?? {} };
}

/** True when the current identity may perform the action at all. */
export async function can<E extends AuthorizationEnv>(
  context: Context<E>,
  resourceId: string,
  action: string,
): Promise<boolean> {
  const authz: AuthorizationContext = context.get('authz');
  return authz.can({
    resource: { type: 'composite', id: resourceId },
    action,
  });
}
