import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as visitorApiRoutes } from './visitors.js';

const routes: readonly AppRouteContribution<Application>[] = [visitorApiRoutes];

export default routes;
