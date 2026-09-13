import { AppConfig } from '@nocobase/app-server/config';
import { coreConfigs } from '@nocobase/app-server';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server/runtime';

// `@nocobase/app-plugin-authentication` declares `account.issuer` as NOT NULL and
// writes `local:credential` for the accounts it creates itself, but sign-up is
// handled by Better Auth, which has no `issuer` field and therefore inserts the
// account row without it. The signature of that mismatch is a 500 from
// `POST /api/auth/sign-up/email` with "NOT NULL constraint failed: account.issuer".
//
// Better Auth applies a model field's `defaultValue` when it creates a record, so
// declaring the field through `auth.account.additionalFields` makes sign-up fill
// the value. The application supplies it as a config source rather than relying
// on `config.yml` alone because deployments (the factory verification runtime
// included) generate their own `auth` section without this field.
const LOCAL_CREDENTIAL_ISSUER = 'local:credential';

const authAccountDefaults = {
  name: 'nb3-factory-auth-account-defaults',
  async read() {
    return {
      kind: 'map' as const,
      value: {
        auth: {
          account: {
            additionalFields: {
              issuer: {
                type: 'string',
                required: false,
                defaultValue: LOCAL_CREDENTIAL_ISSUER,
                input: false,
              },
            },
          },
        },
      },
    };
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

  config.loadFile(configPath, { optional: configuredPath === undefined });
  // Loading after the file deep-merges this default into whatever `auth`
  // section the deployment wrote, leaving the operator's own settings in place.
  config.load(authAccountDefaults);

  return config;
}
