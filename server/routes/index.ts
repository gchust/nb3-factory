import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { materialFileRoutes } from './material-files.js';
import { materialsRoutes } from './materials.js';

const routes: readonly AppRouteContribution<Application>[] = [
  // The file plugin's upload endpoint and its byte route, scoped to material attachments.
  ...materialFileRoutes,
  // This application's materials API.
  materialsRoutes,
];

export default routes;
