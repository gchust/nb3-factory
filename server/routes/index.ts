import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { serviceDeskRoutes } from '../service-desk/routes.js';

const routes: readonly AppRouteContribution<Application>[] = [
  serviceDeskRoutes,
];

export default routes;
