import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import serviceRequestRoutes from './service-requests.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...serviceRequestRoutes,
];

export default routes;
