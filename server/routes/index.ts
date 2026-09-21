import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { complianceApiRoutes } from './compliance.js';

const routes: readonly AppRouteContribution<Application>[] = [
  complianceApiRoutes,
];

export default routes;
