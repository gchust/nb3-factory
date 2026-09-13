import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { resourceCenterRoutes } from './resource-center.js';
import resourceFileRoutes from './resource-files.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...resourceFileRoutes,
  resourceCenterRoutes,
];

export default routes;
