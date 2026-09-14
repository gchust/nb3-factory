import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as recruitingRoutes } from './recruiting.js';

const routes: readonly AppRouteContribution<Application>[] = [recruitingRoutes];

export default routes;
