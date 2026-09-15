import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { contractsApiRoutes } from './contracts.js';

const routes: readonly AppRouteContribution<Application>[] = [
  contractsApiRoutes,
];

export default routes;
