import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { createInspectionFileRoutes } from './inspection-files.js';
import { inspectionApiRoutes } from './inspection.js';

const routes: readonly AppRouteContribution<Application>[] = [
  inspectionApiRoutes,
  ...createInspectionFileRoutes(),
];

export default routes;
