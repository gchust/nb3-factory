import type { Context } from 'hono';

/**
 * The authorization plugin stores its scope on the Hono context under `authz`
 * (see `Authorization.middleware()`), but ships no global declaration for it,
 * so app routes read it untyped. The plugin's public types are re-exported
 * through `@nocobase/authorization`, which the application does not depend on
 * directly, so the scope is described structurally instead.
 *
 * Routes keep passing `context` straight through Hono; this accessor is the
 * only place that touches the context variable, and it works in every
 * TypeScript program (a global `declare module` augmentation would only be
 * visible in programs that include this file).
 */
export interface EquipmentAuthzScope {
  readonly identity: {
    readonly principal: { readonly id: string };
  };
  authorize(request: unknown): Promise<unknown>;
  can(request: unknown): Promise<boolean>;
  require(request: unknown): Promise<void>;
  explain(request: unknown): Promise<unknown>;
  permissions(): Promise<unknown>;
}

export function getContextAuthz(context: Context): EquipmentAuthzScope {
  return context.get('authz') as EquipmentAuthzScope;
}
