import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { teamTaskApiRoutes } from './team-tasks.js';

const routes: readonly AppRouteContribution<Application>[] = [
  teamTaskApiRoutes,
];

export default routes;
