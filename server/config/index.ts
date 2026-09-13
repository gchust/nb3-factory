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

  // The authentication schema stores every credential account under an `issuer`, which is what its
  // unique constraint is built on, but better-auth only writes fields it knows about. Supplying the
  // default here — rather than in config.yml, which a deployment writes for itself — keeps
  // self-service registration working out of the box. `input: false` keeps it out of request bodies.
  config.load({
    name: 'app/auth-account-issuer-default',
    async read() {
      return {
        kind: 'map' as const,
        value: {
          auth: {
            account: {
              additionalFields: {
                issuer: {
                  type: 'string',
                  required: true,
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
