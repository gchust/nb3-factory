import type { ServiceToken } from '@nocobase/service-provider';
import type { AccessService } from '../../../services/access-service.ts';
import type { TicketService } from '../../../services/ticket-service.ts';

/**
 * Workflow-local view of the application's shared service tokens.
 *
 * A run script is loaded from the copied Workflow Artifact, which is a
 * separate module instance from the application build and, in a deployment,
 * sits outside the server's `node_modules`. It therefore may not import
 * `server/services/contracts.ts` directly: that module would not resolve, and
 * even if it did, `ServiceContainer` matches bindings by token identity, so a
 * freshly created token would not find the registered service.
 *
 * Instead both sides look the token up by name in a process-wide registry on
 * `globalThis`. The application creates each token once in
 * `server/services/service-token.ts`; this file reads the same registry and
 * returns the identical object. Keep `SERVICE_TOKEN_REGISTRY` in sync with
 * that file — a test asserts the two lookups agree.
 *
 * This module must stay free of runtime imports so it can be copied into the
 * Artifact unchanged; the service types above are type-only and erased.
 */
const SERVICE_TOKEN_REGISTRY = Symbol.for('nb3-factory.service-token-registry');

type Token = ServiceToken<unknown>;
type TokenRegistry = Map<string, Token>;

function registry(): TokenRegistry {
  const scope = globalThis as unknown as Record<symbol, unknown>;
  const existing = scope[SERVICE_TOKEN_REGISTRY];
  if (existing instanceof Map) return existing as TokenRegistry;
  const created: TokenRegistry = new Map();
  scope[SERVICE_TOKEN_REGISTRY] = created;
  return created;
}

function sharedServiceToken<T>(name: string): ServiceToken<T> {
  const tokens = registry();
  const existing = tokens.get(name);
  if (existing) return existing as ServiceToken<T>;
  // The application normally creates the token first. If a run script ever
  // got here first, this shape matches `createServiceToken`'s result and the
  // application would adopt it from the registry.
  const token = Object.freeze({ name }) as ServiceToken<T>;
  tokens.set(name, token);
  return token;
}

export const accessServiceToken = sharedServiceToken<AccessService>(
  'service.application.access',
);
export const ticketServiceToken = sharedServiceToken<TicketService>(
  'service.application.tickets',
);
