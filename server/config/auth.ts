import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import type { BetterAuthPlugin } from 'better-auth';
import { username } from 'better-auth/plugins';

/**
 * The authentication collection stores a required `issuer` on every account, but Better Auth only persists the
 * fields its own schema declares. Without this field the adapter drops the `issuer` the account hook supplies and
 * the NOT NULL insert fails; the administration service and the seed write `local:credential` directly, so
 * self-registration through `/api/auth/sign-up/email` was the only path that broke.
 */
const credentialIssuer: BetterAuthPlugin = {
  id: 'credential-issuer',
  schema: {
    account: {
      fields: {
        issuer: { type: 'string', required: false },
      },
    },
  },
};

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [username({ displayUsername: false }), credentialIssuer, apiKey()],
  emailAndPassword: { enabled: true, autoSignIn: false },
  session: { storeSessionInDatabase: true },
  databaseHooks: {
    account: {
      create: {
        // Fill the issuer before the insert so a self-registered credential account matches one an administrator
        // created. An issuer already present (an external identity binding) is preserved.
        before: async (account) => ({
          data: {
            ...account,
            issuer:
              (Reflect.get(account, 'issuer') as string | undefined) ??
              'local:credential',
          },
        }),
      },
    },
  },
}));

export default auth;
