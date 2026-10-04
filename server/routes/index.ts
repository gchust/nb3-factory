import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { apiRoutes as ticketApiRoutes } from './tickets.js';

const routes: readonly AppRouteContribution<Application>[] = [ticketApiRoutes];

export default routes;
