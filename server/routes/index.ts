import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { deliveryApiRoutes } from './delivery.js';

const routes: readonly AppRouteContribution<Application>[] = [
  deliveryApiRoutes,
];

export default routes;
