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

  // NocoBase's Authentication tables declare a required `issuer` column on `account`, but the
  // installed better-auth release only writes it when it is declared as an account field. Without
  // this, self sign-up and administrator user creation fail with
  // `NOT NULL constraint failed: account.issuer`. It is applied in code rather than in config.yml
  // because a deployment generates that file and would not carry the setting.
  config.load({
    name: 'app/auth-account-issuer',
    async read() {
      return {
        kind: 'map' as const,
        value: {
          auth: {
            account: {
              additionalFields: {
                issuer: {
                  type: 'string',
                  defaultValue: 'local:credential',
                  input: false,
                },
              },
            },
          },
        },
      };
    },
  });

  return config;
}
