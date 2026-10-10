import { type AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { ApiError } from '@nocobase/app-server/router';
import type { Context } from 'hono';

/**
 * The signed-in user's id, after `auth.required()` has run.
 *
 * The router is deliberately typed with Hono's default environment so that its
 * route contributions stay assignable to the application's router factory; the
 * authentication plugin's `auth.required()` still sets `auth` at runtime, which
 * is what this cast reads.
 *
 * `auth.required()` already refuses an anonymous caller, so the throw is only a
 * safety net for a route that forgets the middleware; it is never reached in
 * the routes this application ships.
 */
export function currentUserId(context: Context): string {
  const auth = (context as Context<AuthEnv>).get('auth');
  if (!auth) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'UNAUTHENTICATED',
      domain: 'app',
      message: 'A signed-in user is required.',
    });
  }
  return auth.user.id;
}
