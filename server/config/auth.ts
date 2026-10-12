import type { AppConfigFactory } from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import {
  defineAuthConfig,
  type AuthConfig,
} from '@nocobase/app-plugin-authentication/server';
import { bearer, deviceAuthorization, username } from 'better-auth/plugins';

/**
 * The command-line clients that may sign in through the browser (`deviceAuthorization()`): `nocobase-cli`, the id
 * `@nocobase/app-cli-client` sends unless a branded CLI names its own. Add the id of any other CLI that should sign in.
 */
const CLI_CLIENT_IDS: readonly string[] = ['nocobase-cli'];

const auth: AppConfigFactory<AuthConfig> = defineAuthConfig({
  defaults: {
    plugins: [
      username({ displayUsername: false }),
      apiKey(),
      // A CLI signs in through the browser (RFC 8628): it shows a code the person approves on `/device`, below the
      // application's base path, and receives a session token it sends as `Authorization: Bearer` (`bearer()`).
      deviceAuthorization({
        verificationUri: '/device',
        expiresIn: '10m',
        interval: '5s',
        validateClient: (clientId) => CLI_CLIENT_IDS.includes(clientId),
      }),
      bearer(),
    ],
    emailAndPassword: { enabled: true, autoSignIn: false },
    session: { storeSessionInDatabase: true },
    account: { encryptOAuthTokens: true },
    // `Auth.required()` refuses a cookie-bearing write whose Origin is not trusted. A directly served application is
    // its own origin, so trust the origin this request arrived at when no `app.publicOrigin` is configured; the check
    // still compares the Origin header against that origin, so a cross-site post is refused. Behind a reverse proxy
    // set `APP_PUBLIC_ORIGIN` (or add the frontend origin here) so the public origin is trusted instead.
    trustedOrigins: (request) => {
      if (!request) return [];
      try {
        return [new URL(request.url).origin];
      } catch {
        return [];
      }
    },
  },
});

export default auth;
