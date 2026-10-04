import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { serviceRoutes } from './service.js';
import { ticketFileRoutes } from './files.js';

const routes: readonly AppRouteContribution<Application>[] = [
  serviceRoutes,
  ...ticketFileRoutes,
];

export default routes;
