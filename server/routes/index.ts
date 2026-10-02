import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import serviceApiRoutes from './service.js';

const routes: readonly AppRouteContribution<Application>[] = [serviceApiRoutes];

export default routes;
