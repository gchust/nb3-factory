import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as equipmentApiRoutes } from './equipment.js';

const routes: readonly AppRouteContribution<Application>[] = [
  // `/api/equipment`: the shared equipment ledger.
  equipmentApiRoutes,
];

export default routes;
