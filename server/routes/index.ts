import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import productionApiRoutes from './production.js';

const routes: readonly AppRouteContribution<Application>[] = [
  productionApiRoutes,
];

export default routes;
