import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { borrowRecordApiRoutes } from './borrow-records.js';
import { equipmentApiRoutes } from './equipment.js';

const routes: readonly AppRouteContribution<Application>[] = [
  equipmentApiRoutes,
  borrowRecordApiRoutes,
];

export default routes;
