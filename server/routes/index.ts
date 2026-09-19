import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import fileRoutes from './files.js';
import { procurementApiRoutes } from './procurement.js';

const routes: readonly AppRouteContribution<Application>[] = [
  procurementApiRoutes,
  ...fileRoutes,
];

export default routes;
