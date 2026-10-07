import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { projectMaterialFileRoutes } from './project-material-files.js';
import { projectMaterialRoutes } from './project-materials.js';

// The file plugin ships the storage services but no routes of its own: the routes under
// `/uploads/projectMaterialFiles` and `/api/projectMaterialFiles` are this application's, so the
// application is the one that authenticates them and checks who owns the bytes.
const routes: readonly AppRouteContribution<Application>[] = [
  ...projectMaterialFileRoutes,
  projectMaterialRoutes,
];

export default routes;
