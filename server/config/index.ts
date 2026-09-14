import { AppConfig } from '@nocobase/app-server/config';
import { coreConfigs } from '@nocobase/app-server';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server/runtime';

/**
 * The authentication tables require `account.issuer`, but the Better Auth version this application uses does not
 * populate that column when a user registers through the Sign up page. Declaring it as an account additional field
 * lets Better Auth supply it on insert while leaving administrator-created accounts (which set it explicitly) as
 * they are.
 *
 * This is a config source rather than a `config.yml` entry so a fresh installation works without one; an explicit
 * `config.yml` still wins because it is loaded afterwards.
 */
const authDefaults = {
  auth: {
    account: {
      additionalFields: {
        issuer: {
          type: 'string',
          required: true,
          defaultValue: 'local:credential',
        },
      },
    },
  },
};

export function createAppConfig(
  context: ResolvedAppRuntimeConfigContext,
): AppConfig<ResolvedAppRuntimeConfigContext> {
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

  config.load({
    name: 'app/auth-defaults',
    read: () => Promise.resolve({ kind: 'map', value: authDefaults }),
  });
  config.loadFile(configPath, { optional: configuredPath === undefined });

  return config;
}
