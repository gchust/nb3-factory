import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as deviceRoutes } from './devices.js';

const routes: readonly AppRouteContribution<Application>[] = [deviceRoutes];

export default routes;
