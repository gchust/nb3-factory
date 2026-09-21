import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import deliveryApiRoutes from './delivery.js';
import { fileGuardRoutes, fileRepositoryRoutes } from './files.js';

// The file guards must be registered before the File plugin's own routes so the
// application's authentication and record authorization run first.
const routes: readonly AppRouteContribution<Application>[] = [
  ...fileGuardRoutes,
  ...fileRepositoryRoutes,
  deliveryApiRoutes,
];

export default routes;
