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

  // Compatibility: the authentication plugin's migration declares
  // `account.issuer` NOT NULL (its administrator path and its seed both write
  // `local:credential`), but the installed better-auth version only knows the
  // core account fields and silently drops `issuer` before the database
  // adapter sees it. Declaring the field as an account additional field keeps
  // it in the adapter payload so credential accounts can be created. Remove
  // this once the plugin and better-auth agree again.
  config.load(authenticationCompatProvider());

  return config;
}

/**
 * better-auth cannot resolve a client address when the application is reached
 * directly, so its sign-in and sign-up limits collapse into one shared bucket
 * of three requests per ten seconds for the whole instance. Registering and
 * signing in several accounts in a row then fails with 429 through no fault of
 * the caller. Raise those paths to a burst that still throttles brute force.
 */
function authenticationCompatProvider(): Parameters<
  AppConfig<ResolvedAppRuntimeConfigContext>['load']
>[0] {
  return {
    name: 'app-authentication-compat',
    read: () =>
      Promise.resolve({
        kind: 'map',
        value: {
          auth: {
            account: {
              additionalFields: { issuer: { type: 'string' } },
            },
            rateLimit: {
              customRules: {
                '/sign-in/username': { window: 10, max: 30 },
                '/sign-in/email': { window: 10, max: 30 },
                '/sign-up/email': { window: 10, max: 30 },
              },
            },
          },
        },
      }),
  } as unknown as Parameters<
    AppConfig<ResolvedAppRuntimeConfigContext>['load']
  >[0];
}
