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
  session: { storeSessionInDatabase: true },
}));

export default auth;
