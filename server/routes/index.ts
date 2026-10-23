import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { materialsApiRoutes } from './materials.js';

const routes: readonly AppRouteContribution<Application>[] = [
  materialsApiRoutes,
];

export default routes;
