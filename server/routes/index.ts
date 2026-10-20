import type { AppRouteContribution } from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';

import { fileRoutes } from './files.js';
import { ticketRoutes } from './tickets.js';
import { workflowRoutes } from './workflows.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...fileRoutes,
  ticketRoutes,
  workflowRoutes,
];

export default routes;
