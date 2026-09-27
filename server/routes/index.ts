import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as libraryRoutes } from './library.js';

const routes: readonly AppRouteContribution<Application>[] = [libraryRoutes];

export default routes;
