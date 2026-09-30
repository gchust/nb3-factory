import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { ticketRoutes } from '../tickets/routes.js';

const routes: readonly AppRouteContribution<Application>[] = [ticketRoutes];

export default routes;
