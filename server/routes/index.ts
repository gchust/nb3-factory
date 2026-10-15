import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import {
  attachmentApiRoutes,
  attachmentContentRoutes,
} from './service-desk/file-routes.js';
import { apiRoutes as serviceDeskApiRoutes } from './service-desk/ticket-routes.js';

const routes: readonly AppRouteContribution<Application>[] = [
  serviceDeskApiRoutes,
  attachmentApiRoutes,
  attachmentContentRoutes,
];

export default routes;
