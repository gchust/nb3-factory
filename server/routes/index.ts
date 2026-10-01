import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as itRepairRoutes } from './it-repair.js';

const routes: readonly AppRouteContribution<Application>[] = [itRepairRoutes];

export default routes;
