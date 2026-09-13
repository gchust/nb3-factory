import { AppConfig } from '@nocobase/app-server/config';
import { coreConfigs } from '@nocobase/app-server';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server/runtime';

export function createAppConfig(
  context: ResolvedAppRuntimeConfigContext,
): AppConfig<ResolvedAppRuntimeConfigContext> {
  withAuthenticationDefaults(context.configs);
  const config = new AppConfig<ResolvedAppRuntimeConfigContext>(
    [...coreConfigs, ...context.configs],
    {
      context,
      environment: context.environment,
    },
  );
  const configuredPath =
    context.configPath ?? context.environment.APP_CONFIG_FILE;
  const configPath = context.paths.root(configuredPath ?? 'config');

  config.loadFile(configPath, { optional: configuredPath === undefined });

  return config;
}

/**
 * Declares the credential account's `issuer` column to better-auth.
 *
 * The authentication schema stores a non-null `issuer` on every credential account, but better-auth only persists a
 * column it knows about: an undeclared field is stripped before the insert, so account creation fails the NOT NULL
 * constraint. Declaring it here — with the value the Authentication-owned user administration service already passes
 * for accounts it creates — keeps self-registration and administrator-created users working without editing the
 * plugin. This is a configuration default, so a deployment can still override it from `config.yml`.
 */
function withAuthenticationDefaults(
  configs: ResolvedAppRuntimeConfigContext['configs'],
): void {
  for (const contribution of configs) {
    if (contribution.kind !== 'config' || contribution.namespace !== 'auth') {
      continue;
    }
    const defaults = contribution.defaults;
    if (!isRecord(defaults)) return;
    const account = isRecord(defaults.account) ? defaults.account : {};
    defaults.account = account;
    const additionalFields = isRecord(account.additionalFields)
      ? account.additionalFields
      : {};
    account.additionalFields = additionalFields;
    if (!('issuer' in additionalFields)) {
      additionalFields.issuer = {
        type: 'string',
        required: false,
        defaultValue: 'local:credential',
        input: false,
      };
    }
    return;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
