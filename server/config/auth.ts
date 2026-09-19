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
    // The authentication plugin stores a credential account with a required
    // `issuer` column, but better-auth's core account model does not carry it,
    // so sign-up and admin-created users fail the NOT NULL constraint. Declare
    // it as an additional account field so better-auth maps and defaults it,
    // without changing the plugin-owned schema.
    additionalFields: {
      issuer: {
        type: 'string',
        required: true,
        defaultValue: 'local:credential',
      },
    },
  },
}));

export default auth;
