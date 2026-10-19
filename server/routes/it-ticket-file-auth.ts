import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';

/**
 * File Repository routes and content URLs are public by design. These two
 * contributions guard only the paths this application's screenshot exposure
 * owns, before the File Repository contribution is mounted.
 *
 * They are route contributions rather than provider middleware because the
 * application's routes are sealed before service providers register.
 */
export const itTicketFileAuthApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    // Resolve without a fallback: a host without authentication has no safe
    // way to guard screenshot uploads, so fail at assembly instead of exposing
    // them.
    const auth = app.container.resolve(authenticationToken);
    // Route contributions are typed as a blank Hono environment, while the
    // authentication middleware declares the variables it installs.
    router.use(
      '/itTicketFiles/*',
      auth.required() as unknown as MiddlewareHandler,
    );
    return router;
  });

export const itTicketFileAuthRootRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes((app) => {
    const router = new Hono();
    // See the API contribution above: authentication is mandatory here.
    const auth = app.container.resolve(authenticationToken);
    router.use(
      '/uploads/it-tickets/*',
      auth.required() as unknown as MiddlewareHandler,
    );
    return router;
  });
