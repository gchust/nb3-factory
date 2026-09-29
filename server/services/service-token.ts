import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * Process-wide registry for the application's own service tokens.
 *
 * A Workflow `run` script is executed from a copied Artifact directory, which
 * is a different module instance from the application's compiled server build,
 * and — in the deployed application — lives outside the directory that holds
 * the server's `node_modules`. `ServiceContainer` matches a binding by token
 * object identity, so a token created independently by the run script could
 * never resolve the application's service.
 *
 * Every application token is therefore created once and stored on
 * `globalThis` under a well-known symbol, keyed by its contract name. The run
 * script performs the same lookup through its own copy of this registry (see
 * `server/workflows/ticket-acceptance/server/service-tokens.ts`, which must
 * keep the same registry key) and receives the identical object.
 *
 * Keep the symbol string in the two files in sync; a test asserts that both
 * lookups return the same instance.
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

/** Return the one process-wide token for `name`, creating it on first use. */
export function sharedServiceToken<T>(name: string): ServiceToken<T> {
  const tokens = registry();
  const existing = tokens.get(name);
  if (existing) return existing as ServiceToken<T>;
  const token = createServiceToken<T>(name);
  tokens.set(name, token);
  return token;
}
