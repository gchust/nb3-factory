/**
 * Turns a request's authorization context into the record-scoped decisions the
 * CRM service works with.
 *
 * A route resolves its identity with `authz.middleware()`; the service asks for
 * the composite action it is about to perform and receives one database policy
 * per collection, already narrowed to the caller's record access. Nothing here
 * filters rows in memory: the policies are bound to repositories by
 * `server/crm/service.ts`.
 */

import type { AuthorizationContext } from '@nocobase/app-plugin-authorization';
import type {
  AuthorizationDecision,
  CompositeResourceConditions,
} from '@nocobase/authorization/core';
import type { RepositoryPolicy } from '@nocobase/db';

import { CRM_COLLECTIONS, type CrmCollection } from './types.js';

export type CrmAction = 'view' | 'edit' | 'delete' | 'suggest' | 'manageTeam';

export type CrmPolicies = Readonly<
  Partial<Record<CrmCollection, RepositoryPolicy>>
>;

export interface CrmAccess {
  principalId: string;
  view: CrmPolicies;
  edit: CrmPolicies;
  remove: CrmPolicies;
  suggest?: CrmPolicies;
  canManageTeam: boolean;
  canSuggest: boolean;
}

/** Raised when the identity may not perform the requested CRM action at all. */
export class CrmDeniedError extends Error {
  public readonly action: CrmAction;

  constructor(action: CrmAction, message: string) {
    super(message);
    this.name = 'CrmDeniedError';
    this.action = action;
  }
}

/** Raised when a record is absent or outside the caller's record access. */
export class CrmNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmNotFoundError';
  }
}

function policiesOf(
  decision: AuthorizationDecision<CompositeResourceConditions>,
): CrmPolicies {
  const database = decision.conditions?.database ?? {};
  const policies: Partial<Record<CrmCollection, RepositoryPolicy>> = {};
  for (const collection of CRM_COLLECTIONS) {
    const policy = database[collection];
    if (policy) {
      policies[collection] = policy;
    }
  }
  return policies;
}

async function authorize(
  authz: AuthorizationContext,
  action: CrmAction,
): Promise<AuthorizationDecision<CompositeResourceConditions>> {
  return authz.authorize({
    resource: { type: 'composite', id: 'crm' },
    action,
  });
}

/**
 * Resolves every action the request needs plus the two capability flags.
 *
 * A denied action is fatal: the caller cannot perform the operation on any row.
 * A conditional one is expected and carries the record scope. `manageTeam` and
 * `suggest` are capabilities, so their absence is reported as a flag rather
 * than an error.
 */
export async function resolveCrmAccess(
  authz: AuthorizationContext,
  actions: readonly CrmAction[] = ['view'],
): Promise<CrmAccess> {
  const decisions = new Map<
    CrmAction,
    AuthorizationDecision<CompositeResourceConditions>
  >();
  for (const action of actions) {
    const decision = await authorize(authz, action);
    if (decision.effect === 'deny') {
      throw new CrmDeniedError(
        action,
        `CRM action "${action}" is not allowed.`,
      );
    }
    decisions.set(action, decision);
  }

  const [view, teamDecision, suggestDecision] = await Promise.all([
    decisions.get('view') ?? authorize(authz, 'view'),
    authorize(authz, 'manageTeam'),
    authorize(authz, 'suggest'),
  ]);

  return {
    principalId: authz.identity.principal.id,
    view: policiesOf(view),
    edit: decisions.has('edit') ? policiesOf(decisions.get('edit')!) : {},
    remove: decisions.has('delete') ? policiesOf(decisions.get('delete')!) : {},
    ...(suggestDecision.effect === 'deny'
      ? {}
      : { suggest: policiesOf(suggestDecision) }),
    canManageTeam: teamDecision.effect === 'permit',
    canSuggest: suggestDecision.effect !== 'deny',
  };
}
