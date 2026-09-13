import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { fileRoutes } from './files.js';
import { itApiRoutes } from './it-operations.js';

const routes: readonly AppRouteContribution<Application>[] = [
  itApiRoutes,
  ...fileRoutes,
];

export default routes;
