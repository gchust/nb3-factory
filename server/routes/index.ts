import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { mediaApiRoutes, mediaContentRoutes } from './media.js';

const routes: readonly AppRouteContribution<Application>[] = [
  mediaApiRoutes,
  mediaContentRoutes,
];

export default routes;
