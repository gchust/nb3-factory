import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as itTicketsApiRoutes } from './it-tickets.js';

const routes: readonly AppRouteContribution<Application>[] = [
  itTicketsApiRoutes,
];

export default routes;
