import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { createResourceRoutes } from './resources.js';
import { createServiceRoutes } from './service.js';

export const serviceApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    // Mounted on its own prefix so this route's middleware cannot leak into a
    // contribution registered later on the same top-level router.
    router.route('/service', createServiceRoutes(app));
    return router;
  });

// NocoBase-style collection aliases at `/api/customers:list` and friends.
// Registered as a separate contribution so its own authentication middleware
// stays scoped to the aliases.
export const resourceApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    router.route('/', createResourceRoutes(app));
    return router;
  });

const routes: readonly AppRouteContribution<Application>[] = [
  serviceApiRoutes,
  resourceApiRoutes,
];

export default routes;
