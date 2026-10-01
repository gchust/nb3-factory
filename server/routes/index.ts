import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { itTicketApiRoutes } from './it-tickets.js';

const routes: readonly AppRouteContribution<Application>[] = [
  itTicketApiRoutes,
];

export default routes;
