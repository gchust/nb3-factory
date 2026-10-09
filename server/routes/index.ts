import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { projectMaterialFileRoutes } from './project-material-files.js';
import { projectMaterialApiRoutes } from './project-materials.js';

// The application's own business routes: project materials and their attachments. The file routes come first so the
// upload endpoint and the content byte route exist before anything could be mounted on the same paths.
const routes: readonly AppRouteContribution<Application>[] = [
  ...projectMaterialFileRoutes,
  projectMaterialApiRoutes,
];

export default routes;
