import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

/**
 * The username character set this application stores.
 *
 * better-auth's built-in validator allows only `[a-zA-Z0-9_.]`, but every
 * account this application ships (and the operators create through the Users
 * page) uses a hyphen: `svc-admin`, `svc-east`, `svc-south2`, and so on. A
 * narrow validator made those accounts impossible to sign in with by username
 * and made admin user creation fail with `Username is invalid`, so the rule
 * here follows the application's own accounts instead of the library default.
 */
export function isServiceUsername(value: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/u.test(value);
}

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [
    username({ displayUsername: false, usernameValidator: isServiceUsername }),
    apiKey(),
  ],
  emailAndPassword: { enabled: true, autoSignIn: false },
  session: { storeSessionInDatabase: true },
  // The `account` table keeps a NOT NULL `issuer` (see the authentication
  // migration and the default admin seed). The installed better-auth release
  // dropped `issuer` from its built-in account schema, so `internalAdapter`
  // never forwards it and every credential-account insert fails on the NOT
  // NULL constraint. Declaring it as a field with a default keeps the column
  // populated for every account creation path (admin create, sign-up, reset).
  account: {
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
