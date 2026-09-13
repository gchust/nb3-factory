import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { crmApiRoutes } from './crm/index.js';

const routes: readonly AppRouteContribution<Application>[] = [crmApiRoutes];

export default routes;
