import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as knowledgeApiRoutes } from './knowledge.js';

const routes: readonly AppRouteContribution<Application>[] = [
  knowledgeApiRoutes,
];

export default routes;
