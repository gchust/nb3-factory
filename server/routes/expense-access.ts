import type {
  AuthorizationScope,
  DatabaseAuthorizationConditions,
  DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization';
import { HTTPException } from 'hono/http-exception';

export interface ExpenseFieldRequest {
  readonly input?: readonly string[];
  readonly output?: readonly string[];
}

/**
 * Returns the database conditions for an action, or refuses the request.
 *
 * A `deny` decision and a decision shape that carries no conditions are both 403: without conditions the caller
 * has no field or record scope, and treating that as "all records" would turn a refusal into a data leak.
 */
export async function authorizeDatabase(
  scope: AuthorizationScope,
  resourceId: string,
  action: string,
  fields: ExpenseFieldRequest,
): Promise<DatabaseAuthorizationConditions> {
  const decision = await scope.authorize<DatabaseAuthorizationParams>({
    resource: { type: 'database.collection', id: resourceId },
    action,
    params: { fields },
  });
  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    throw new HTTPException(403, {
      message: `Forbidden: ${action} on ${resourceId}`,
    });
  }
  return decision.conditions as DatabaseAuthorizationConditions;
}

/** Refuses the request unless the caller holds the named expense operation. */
export async function authorizeOperation(
  scope: AuthorizationScope,
  operation: string,
): Promise<void> {
  const decision = await scope.authorize({
    resource: { type: 'expense.operation', id: '*' },
    action: operation,
  });
  if (decision.effect !== 'permit') {
    throw new HTTPException(403, {
      message: `Forbidden: expense operation "${operation}"`,
    });
  }
}

export function principalId(scope: AuthorizationScope): string {
  return scope.identity.principal.id;
}
