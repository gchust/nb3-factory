import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

// The `account` table stores the credential issuer as a required column
// (`issuer`), but Better Auth's built-in account model has no such field. Without
// declaring it here, Better Auth strips `issuer` from the insert and every account
// creation (sign-up and User management) fails the NOT NULL constraint. Declaring
// it as a server-controlled field with the local default keeps sign-up working and
// matches the value User management and the demo seed already write.
const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [username({ displayUsername: false }), apiKey()],
  emailAndPassword: { enabled: true, autoSignIn: false },
  account: {
    additionalFields: {
      issuer: {
        type: 'string',
        required: true,
        input: false,
        defaultValue: 'local:credential',
      },
    },
  },
  // Better Auth limits sign-in to 3 attempts per 10 seconds per address by
  // default. The login page advertises five demo accounts and a reviewer
  // switches between them to check each role, so the default turned ordinary
  // role-switching into a 429 ("Too many requests") partway through the tour.
  // Keep a real brute-force limit, just one that a person trying the roles
  // cannot trip: 20 sign-ins per minute instead of 3 per 10 seconds.
  rateLimit: {
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/username': { window: 60, max: 20 },
      '/sign-in/email': { window: 60, max: 20 },
      '/sign-up/email': { window: 60, max: 20 },
    },
  },
  session: { storeSessionInDatabase: true },
}));

export default auth;
