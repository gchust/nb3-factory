import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { helpdeskApiRoutes } from './helpdesk.js';

const routes: readonly AppRouteContribution<Application>[] = [
  helpdeskApiRoutes,
];

export default routes;
