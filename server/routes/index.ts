import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as supportApiRoutes } from './support.js';

const routes: readonly AppRouteContribution<Application>[] = [supportApiRoutes];

export default routes;
