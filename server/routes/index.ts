import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import hrRoutes from './hr.js';

const routes: readonly AppRouteContribution<Application>[] = [hrRoutes];

export default routes;
