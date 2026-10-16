import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as devices } from './devices.js';

const routes: readonly AppRouteContribution<Application>[] = [devices];

export default routes;
