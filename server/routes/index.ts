import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';

import { createMaterialsRouter } from './materials.js';

/**
 * Application-owned HTTP contributions. The materials router is mounted under `/api`; its own paths start with
 * `/materials`.
 */
const routes: readonly AppRouteContribution<Application>[] = [
  defineApiRoutes((app) => createMaterialsRouter(app)),
];

export default routes;
