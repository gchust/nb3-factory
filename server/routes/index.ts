import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { retailApiRoutes } from './retail.js';

const routes: readonly AppRouteContribution<Application>[] = [retailApiRoutes];

export default routes;
