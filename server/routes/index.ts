import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import announcementsRoutes from './announcements.js';

const routes: readonly AppRouteContribution<Application>[] = [
  announcementsRoutes,
];

export default routes;
