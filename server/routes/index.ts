import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import serviceRoutes from './service.js';
import fileRoutes from './files.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...fileRoutes,
  serviceRoutes,
];

export default routes;
