import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import repairApiRoutes from './repair.js';

const routes: readonly AppRouteContribution<Application>[] = [repairApiRoutes];

export default routes;
