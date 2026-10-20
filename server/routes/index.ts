import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import documentRoutes from './documents.js';
import leaveRoutes from './leave.js';

const routes: readonly AppRouteContribution<Application>[] = [
  leaveRoutes,
  documentRoutes,
];

export default routes;
