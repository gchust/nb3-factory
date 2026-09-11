import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { equipmentInspectionApiRoutes } from './equipment-inspection.js';
import { fileApiRoutes, fileRootRoutes } from './file-repositories.js';

const routes: readonly AppRouteContribution<Application>[] = [
  fileApiRoutes,
  fileRootRoutes,
  equipmentInspectionApiRoutes,
];

export default routes;
