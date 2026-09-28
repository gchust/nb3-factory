import type {
  AuthorizationContext,
  AuthorizationDecision,
  CompositeResourceConditions,
} from '@nocobase/authorization/core';
import type { RepositoryPolicy } from '@nocobase/db';

import {
  IT_TICKETS_ACTION,
  IT_TICKETS_COLLECTION,
  IT_TICKETS_RESOURCE,
  type ItTicketAction,
} from './constants.js';
import type { ItTicketRecord } from './resources.js';

export interface ItTicketAuthorization {
  /** The composite action was not denied; conditional counts as permitted. */
  readonly permitted: boolean;
  /** The Repository Policy to bind for this operation. */
  readonly policy: RepositoryPolicy<ItTicketRecord>;
}

/**
 * A permitted action's policy when authorization was bypassed.
 *
 * An unrestricted identity — root, for example — gets `permit` from the fast
 * path with no underlying conditions, so there is no `database` policy to
 * bind. These fallbacks keep the bound Repository scoped to exactly the
 * operations the action needs, and read is always present because a mutation
 * returns the row it wrote.
 */
const FALLBACK_POLICY: Record<
  ItTicketAction,
  RepositoryPolicy<ItTicketRecord>
> = {
  [IT_TICKETS_ACTION.view]: {
    read: true,
    create: false,
    update: false,
    delete: false,
  },
  [IT_TICKETS_ACTION.create]: {
    read: true,
    create: true,
    update: false,
    delete: false,
  },
  [IT_TICKETS_ACTION.start]: {
    read: true,
    create: false,
    update: true,
    delete: false,
  },
  [IT_TICKETS_ACTION.complete]: {
    read: true,
    create: false,
    update: true,
    delete: false,
  },
};

/**
 * Resolves one composite action once, so the handler can both decide and bind
 * the same decision.
 */
export async function authorizeItTicket(
  authorization: AuthorizationContext,
  action: ItTicketAction,
): Promise<ItTicketAuthorization> {
  const decision: AuthorizationDecision<CompositeResourceConditions> =
    await authorization.authorize({
      resource: { type: 'composite', id: IT_TICKETS_RESOURCE },
      action,
    });

  if (decision.effect === 'deny') {
    return { permitted: false, policy: FALLBACK_POLICY[action] };
  }

  const policy = decision.conditions?.database?.[IT_TICKETS_COLLECTION];
  if (policy) {
    return {
      permitted: true,
      policy,
    };
  }

  if (decision.effect === 'permit') {
    return { permitted: true, policy: FALLBACK_POLICY[action] };
  }

  // A conditional decision without an underlying policy permits nothing.
  return { permitted: false, policy: FALLBACK_POLICY[action] };
}

/** Which workflow controls the current identity may see. */
export interface ItTicketCapabilities {
  readonly create: boolean;
  readonly start: boolean;
  readonly complete: boolean;
}

/**
 * Which action controls to render. This is presentation only: every route
 * checks again on the server and a stale button cannot widen a scope.
 */
export async function itTicketCapabilities(
  authorization: AuthorizationContext,
): Promise<ItTicketCapabilities> {
  const [create, start, complete] = await Promise.all([
    authorizeItTicket(authorization, IT_TICKETS_ACTION.create),
    authorizeItTicket(authorization, IT_TICKETS_ACTION.start),
    authorizeItTicket(authorization, IT_TICKETS_ACTION.complete),
  ]);

  return {
    create: create.permitted && create.policy.create !== false,
    start: start.permitted && start.policy.update !== false,
    complete: complete.permitted && complete.policy.update !== false,
  };
}
