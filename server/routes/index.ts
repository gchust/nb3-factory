import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import testNotificationRoutes from './test-notifications.js';

const routes: readonly AppRouteContribution<Application>[] = [
  testNotificationRoutes,
];

export default routes;
