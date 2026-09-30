import type { ServiceToken } from '@nocobase/service-provider';
import type { ServiceTicketService } from '../../../providers/ticket-service.js';

/**
 * The Artifact copy of the application's shared service-token registry.
 *
 * This file is compiled into `dist/server/workflows/ticket-acceptance/server/`
 * and copied, with this package's run modules, into the deployable Artifact
 * under `dist/server/workflows/<key>/<digest>/server/` (and, at runtime, into
 * `storage/private/workflows/<key>/<digest>/server/`). From there a relative
 * import back into application source is unreachable and a bare package import
 * has no `node_modules` to resolve against, so the token cannot be imported
 * from `server/providers/tokens.ts`.
 *
 * Service tokens are identity objects, so the run module and the provider only
 * resolve the same service when both hold the *same* object. Both this copy and
 * `server/providers/service-tokens.ts` therefore keep one token object per name
 * on `globalThis`, keyed by the same `Symbol.for('nb3-factory.service-tokens')`,
 * so the token resolves identically across module instances in one process.
 * Keep the two copies in step: the duplication is forced by
 * `nocobase workflow build`, which clears `dist/server/workflows` after
 * compiling it, so the canonical helper cannot live under `server/workflows`.
 *
 * `createServiceToken` is `Object.freeze({ name })`; reproducing it here keeps
 * the Artifact free of a runtime import of `@nocobase/service-provider`. Only
 * the *type* is imported, which erases at compile time.
 */
const TOKEN_REGISTRY_KEY = Symbol.for('nb3-factory.service-tokens');

function tokenRegistry(): Map<string, ServiceToken<unknown>> {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  const existing = holder[TOKEN_REGISTRY_KEY];
  if (existing instanceof Map) {
    return existing as Map<string, ServiceToken<unknown>>;
  }
  const registry = new Map<string, ServiceToken<unknown>>();
  holder[TOKEN_REGISTRY_KEY] = registry;
  return registry;
}

export function sharedServiceToken<T>(name: string): ServiceToken<T> {
  if (!name.trim()) {
    throw new Error('Service token name must not be empty.');
  }
  const registry = tokenRegistry();
  const existing = registry.get(name);
  if (existing) {
    return existing as ServiceToken<T>;
  }
  const token: ServiceToken<T> = Object.freeze({ name });
  registry.set(name, token);
  return token;
}

/** The token the ticket acceptance workflow resolves its service through. */
export const serviceTicketServiceToken =
  sharedServiceToken<ServiceTicketService>('service.ticket');
