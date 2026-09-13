import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as procurementApiRoutes } from './procurement.js';

const routes: readonly AppRouteContribution<Application>[] = [
  procurementApiRoutes,
];

export default routes;
