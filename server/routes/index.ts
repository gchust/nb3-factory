import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { inspectionApiRoutes } from './inspection-api.js';

const routes: readonly AppRouteContribution<Application>[] = [
  inspectionApiRoutes,
];

export default routes;
