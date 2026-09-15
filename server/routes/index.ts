import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { documentApiRoutes, documentContentRoutes } from './documents.js';

const routes: readonly AppRouteContribution<Application>[] = [
  documentApiRoutes,
  documentContentRoutes,
];

export default routes;
