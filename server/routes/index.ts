import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as libraryApiRoutes } from './library/document-routes.js';

const routes: readonly AppRouteContribution<Application>[] = [libraryApiRoutes];

export default routes;
