import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { deliveryApiRoutes } from './delivery.js';
import { deliveryFileApiRoutes, deliveryFileRootRoutes } from './files.js';

const routes: readonly AppRouteContribution<Application>[] = [
  deliveryFileApiRoutes,
  deliveryFileRootRoutes,
  deliveryApiRoutes,
];

export default routes;
