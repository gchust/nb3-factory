import type { ServiceToken } from '@nocobase/service-provider';
import type { ServiceTicketService } from './ticket-service.js';

/**
 * The application's side of the shared service-token registry.
 *
 * Service tokens are identity objects, so a workflow run module and the
 * application provider only resolve the same service when both hold the *same*
 * object. A workflow run module is compiled and copied into a deployable
 * Artifact under `dist/server/workflows/<key>/<digest>/server/` (and committed
 * at runtime to `storage/private/workflows/...`), where a relative import back
 * into the application source is unreachable and a bare package import has no
 * `node_modules` to resolve against.
 *
 * This module therefore keeps one token object per name on `globalThis`, which
 * every module instance in the process shares. The Artifact carries its own
 * byte-equivalent copy at
 * `server/workflows/ticket-acceptance/server/service-tokens.ts`; both read and
 * write the same registry, so the provider and the materialized run module
 * resolve the identical frozen object. Keep the two copies in step — the
 * duplication is forced by the build, which clears `dist/server/workflows`
 * after compiling it, so this file cannot live there.
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
