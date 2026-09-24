import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import serviceRequestApiRoutes from './service-requests.js';

const routes: readonly AppRouteContribution<Application>[] = [
  serviceRequestApiRoutes,
];

export default routes;
