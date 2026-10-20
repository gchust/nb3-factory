import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { deviceApiRoutes } from './devices.js';

const routes: readonly AppRouteContribution<Application>[] = [deviceApiRoutes];

export default routes;
