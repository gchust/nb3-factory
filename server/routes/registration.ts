import {
  userAdministrationServiceToken,
  UserAdministrationError,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Self-registration for the expense application.
 *
 * This route is deliberately public: a visitor without an account has no session to authenticate with, which is the
 * same reason the authentication plugin exposes a public sign-up endpoint. It creates the account through the
 * Authentication-owned user administration service so the credential account gets the issuer the authentication
 * schema requires — the plugin's default sign-up path omits that column and fails the NOT NULL constraint on this
 * release. Input is validated by the service, duplicate identities are rejected, and no role or elevated grant is
 * assigned: a self-registered account is a regular user.
 */
export const registrationApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const users = app.container.resolve(userAdministrationServiceToken);

    router.post('/register', async (context) => {
      let body: Record<string, unknown>;
      try {
        const parsed: unknown = await context.req.json();
        body =
          typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)
            : {};
      } catch {
        return context.json(
          { code: 'VALIDATION', message: 'A JSON request body is required.' },
          400,
        );
      }

      const name = text(body.name);
      const email = text(body.email);
      const password = typeof body.password === 'string' ? body.password : '';
      const username = text(body.username);
      if (!name || !email || !password) {
        return context.json(
          {
            code: 'VALIDATION',
            message: 'Name, email and password are required.',
          },
          400,
        );
      }

      try {
        const user = await users.create({
          name,
          email,
          password,
          ...(username ? { username } : {}),
        });
        return context.json(
          {
            data: {
              id: user.id,
              name: user.name,
              username: user.username ?? null,
              email: user.email,
            },
          },
          201,
        );
      } catch (error) {
        if (error instanceof UserAdministrationError) {
          const conflict =
            error.code === 'USER_EMAIL_CONFLICT' ||
            error.code === 'USER_USERNAME_CONFLICT' ||
            error.code === 'USER_IDENTITY_CONFLICT';
          return context.json(
            { code: error.code, message: error.message },
            (conflict ? 409 : 400) as ContentfulStatusCode,
          );
        }
        throw error;
      }
    });

    return router;
  });

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
