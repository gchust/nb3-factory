import { AppConfig } from '@nocobase/app-server/config';
import { coreConfigs } from '@nocobase/app-server';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server/runtime';

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

  config.loadFile(configPath, { optional: configuredPath === undefined });

  // The Authentication plugin's `account` table requires a non-null `issuer`,
  // but its better-auth schema does not declare that field, so self-registration
  // (and the plugin's own user-administration create) insert an account without
  // it and fail with a NOT NULL constraint. Declaring the field as a
  // better-auth account field with a fixed default lets Authentication keep
  // owning credential creation; no application code writes the table directly.
  config.load({
    name: 'app/authentication-account-issuer',
    read: () =>
      Promise.resolve({
        kind: 'map' as const,
        value: {
          auth: {
            account: {
              additionalFields: {
                issuer: {
                  type: 'string',
                  required: true,
                  input: false,
                  defaultValue: 'local:credential',
                },
              },
            },
          },
        },
      }),
  });

  return config;
}
