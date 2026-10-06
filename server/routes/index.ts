import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import projectMaterialsApiRoutes from './project-materials.js';

const routes: readonly AppRouteContribution<Application>[] = [
  projectMaterialsApiRoutes,
];

export default routes;
