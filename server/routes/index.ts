import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  createMaterialApiRouter,
  materialContentGuard,
  materialFileRoutes,
  materialUploadGuard,
} from './materials.js';

// Order is the security boundary. The two guards are mounted before the file
// plugin's routes they decide, and the CRUD sub-router is independent of both.
const materialApiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    router.route('/materials', createMaterialApiRouter(app));
    return router;
  },
);

const routes: readonly AppRouteContribution<Application>[] = [
  materialContentGuard,
  materialUploadGuard,
  ...materialFileRoutes,
  materialApiRoutes,
];

export default routes;