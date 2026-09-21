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
  account: {
    additionalFields: {
      // The `account` collection keeps a NOT NULL `issuer` column (see the authentication plugin's
      // migration) that Better Auth does not know about, so its own sign-up drops the column from
      // the insert and a self-service registration fails on the constraint. Declaring the column
      // and its default keeps it in Better Auth's account schema and labels a signed-up password
      // account `local:credential`, the same value the account administration path writes.
      issuer: { type: 'string', defaultValue: 'local:credential' },
    },
  },
}));

export default auth;
