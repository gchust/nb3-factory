import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { itSupportApiRoutes } from '../it-support/routes.js';

/**
 * Application-owned HTTP routes. The IT ticket endpoints live under `/api`
 * because `itSupportApiRoutes` is an API-scope contribution.
 */
const routes: readonly AppRouteContribution<Application>[] = [
  itSupportApiRoutes,
];

export default routes;
