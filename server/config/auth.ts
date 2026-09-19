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
  // The plugin's `account` table declares `issuer` NOT NULL, but it is not part
  // of Better Auth's own account schema, so every account creation path would
  // otherwise omit it and fail the constraint. Declaring it here makes the
  // database adapter keep the field and fills the credential default; the
  // plugin's administration service passes `issuer` explicitly for the same
  // reason.
  account: {
    additionalFields: {
      issuer: {
        type: 'string',
        required: false,
        defaultValue: 'local:credential',
        input: false,
      },
    },
  },
}));

export default auth;
