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
  // The account table stores the credential issuer as NOT NULL. Better Auth
  // does not know that column on its own, so it is declared here with the
  // default every public sign-up must carry; the administration service uses
  // the same value. Without this, self-registration fails on the constraint.
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
}));

export default auth;
