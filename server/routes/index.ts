import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import salesApiRoutes from './sales.js';

const routes: readonly AppRouteContribution<Application>[] = [salesApiRoutes];

export default routes;
