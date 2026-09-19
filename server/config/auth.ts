import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

/**
 * NocoBase stores a credential account row with a NOT NULL `issuer` column
 * (`local:credential`). Better Auth does not know that column, and its adapter
 * factory drops every field that is not declared in the account schema, so a
 * credential sign-up or an administrator-created user fails with
 * `NOT NULL constraint failed: account.issuer`. Declaring `issuer` as an
 * additional account field keeps it in the schema and gives it the same
 * default on every creation path; an explicit value still wins.
 */
const ACCOUNT_ISSUER = 'local:credential';

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
        fieldName: 'issuer',
        defaultValue: ACCOUNT_ISSUER,
      },
    },
  },
}));

export default auth;
