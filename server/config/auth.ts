import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [username({ displayUsername: false }), apiKey()],
  emailAndPassword: { enabled: true, autoSignIn: false },
  session: { storeSessionInDatabase: true },
  // The authentication schema declares `account.issuer` as NOT NULL, but the
  // built-in email sign-up path neither sends it nor knows the column, so the
  // adapter drops it. Declare it as an account field and stamp it in the hook
  // below; seeded and administrator-created accounts carry the same value.
  account: {
    additionalFields: {
      issuer: { type: 'string', required: false, input: true },
    },
  },
  databaseHooks: {
    account: {
      create: {
        before: async (account) => {
          const issuer = (account as Record<string, unknown>).issuer;
          return issuer
            ? undefined
            : { data: { ...account, issuer: 'local:credential' } };
        },
      },
    },
  },
}));

export default auth;
