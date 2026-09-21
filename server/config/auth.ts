import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import type { BetterAuthPlugin } from 'better-auth';
import { username } from 'better-auth/plugins';

// The `account.issuer` column is NOT NULL, but Better Auth's credential sign-up
// neither declares nor populates the field. Without this the /register page
// fails with SQLITE_CONSTRAINT_NOTNULL and can never create a user. Declaring
// the field in the schema is what stops the adapter from dropping it again, and
// the hook fills in the same value the authentication seed and administration
// service write.
const credentialIssuer = 'local:credential';

function accountIssuer(): BetterAuthPlugin {
  return {
    id: 'account-issuer',
    schema: {
      account: {
        fields: {
          issuer: { type: 'string', required: false },
        },
      },
    },
    init() {
      return {
        options: {
          databaseHooks: {
            account: {
              create: {
                before: async (account: Record<string, unknown>) => {
                  const existing = account.issuer;
                  return {
                    data: {
                      ...account,
                      issuer:
                        typeof existing === 'string' && existing.length > 0
                          ? existing
                          : credentialIssuer,
                    },
                  };
                },
              },
            },
          },
        },
      };
    },
  };
}

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [username({ displayUsername: false }), accountIssuer(), apiKey()],
  emailAndPassword: { enabled: true, autoSignIn: false },
  session: { storeSessionInDatabase: true },
}));

export default auth;
