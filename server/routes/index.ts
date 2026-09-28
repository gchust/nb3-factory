import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as devicesApiRoutes } from './devices.js';

const routes: readonly AppRouteContribution<Application>[] = [devicesApiRoutes];

export default routes;
