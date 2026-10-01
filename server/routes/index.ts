import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { crmRoutes } from './crm.js';

const routes: readonly AppRouteContribution<Application>[] = [crmRoutes];

export default routes;
