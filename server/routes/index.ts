import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import {
  projectMaterialFilesApiRoutes,
  projectMaterialFilesRootRoutes,
} from './project-material-files.js';
import { projectMaterialsApiRoutes } from './project-materials.js';

const routes: readonly AppRouteContribution<Application>[] = [
  projectMaterialsApiRoutes,
  // The File plugin's upload and byte routes, wrapped with this application's
  // authentication and ownership checks.
  projectMaterialFilesApiRoutes,
  projectMaterialFilesRootRoutes,
];

export default routes;
