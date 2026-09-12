import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { officeSuppliesApiRoutes } from './office-supplies.js';

const routes: readonly AppRouteContribution<Application>[] = [
  officeSuppliesApiRoutes,
];

export default routes;
