import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

/**
 * Stable issuer for password accounts created by the sign-up endpoint.
 *
 * The `account` collection requires `issuer` (it is part of the
 * `(issuer, account_id)` uniqueness rule), but Better Auth's own
 * `linkAccount` does not know that application column, so a sign-up inserts a
 * NULL and SQLite rejects it with SQLITE_CONSTRAINT_NOTNULL. Declaring the
 * field with a default makes Better Auth include it on every account insert;
 * the value matches what the administration service writes when it creates a
 * user. It is not client input — `input: false` keeps it off the sign-up body.
 */
const LOCAL_CREDENTIAL_ISSUER = 'local:credential';

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [username({ displayUsername: false }), apiKey()],
  emailAndPassword: { enabled: true, autoSignIn: false },
  session: { storeSessionInDatabase: true },
  account: {
    additionalFields: {
      issuer: {
        type: 'string',
        required: false,
        input: false,
        defaultValue: LOCAL_CREDENTIAL_ISSUER,
      },
    },
  },
}));

export default auth;
