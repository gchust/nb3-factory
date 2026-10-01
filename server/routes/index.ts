import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import projectMaterialFilesRoutes from './project-material-files.js';
import projectMaterialsRoutes from './project-materials.js';

const routes: readonly AppRouteContribution<Application>[] = [
  projectMaterialsRoutes,
  projectMaterialFilesRoutes,
];

export default routes;
