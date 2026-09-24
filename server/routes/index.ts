import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as ticketRoutes } from './tickets.js';

const routes: readonly AppRouteContribution<Application>[] = [ticketRoutes];

export default routes;
