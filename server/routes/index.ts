import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { salesRoutes } from './sales.js';

const routes: readonly AppRouteContribution<Application>[] = [salesRoutes];

export default routes;
