import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as itTicketRoutes } from './it-tickets.js';

const routes: readonly AppRouteContribution<Application>[] = [itTicketRoutes];

export default routes;
