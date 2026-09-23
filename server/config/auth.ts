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
  // @nocobase/app-plugin-authentication 0.1.0-beta.18 still ships an `account`
  // collection migration with a NOT NULL `issuer` column and writes
  // `issuer: 'local:credential'` when it provisions a credential account.
  // Better Auth 1.7.5 removed `issuer` from its core account model, so its
  // input parser strips the field and every account insert fails with
  // `NOT NULL constraint failed: account.issuer`. Declaring it as an account
  // additional field keeps Better Auth's schema aligned with the migration so
  // sign-up and user administration can persist credential accounts.
  account: {
    additionalFields: {
      issuer: {
        type: 'string',
        required: false,
        defaultValue: 'local:credential',
      },
    },
  },
}));

export default auth;
