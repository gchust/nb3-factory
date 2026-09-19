import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import type { BetterAuthPlugin } from 'better-auth';
import { username } from 'better-auth/plugins';

/**
 * The authentication schema declares `account.issuer` as NOT NULL, and the
 * user-administration service fills it in. Better Auth's own sign-up path does
 * not know the field, so it omits it and public registration fails the
 * constraint. Declaring the field here puts it into Better Auth's account
 * schema, which makes it pass the value through and apply this default.
 */
const accountIssuer: BetterAuthPlugin = {
  id: 'account-issuer',
  schema: {
    account: {
      fields: {
        issuer: {
          type: 'string',
          required: false,
          defaultValue: 'local:credential',
        },
      },
    },
  },
};

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [username({ displayUsername: false }), apiKey(), accountIssuer],
  emailAndPassword: { enabled: true, autoSignIn: false },
  session: { storeSessionInDatabase: true },
}));

export default auth;
