import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import {
  materialFileApiRoutes,
  materialFileRootRoutes,
} from './material-files.js';
import { projectMaterialApiRoutes } from './project-materials.js';

/**
 * Route order matters twice here.
 *
 * `materialFileRootRoutes` mounts at the application root and must be
 * registered before nothing else at that scope: the File plugin contributes no
 * routes of its own, so this guarded copy is the only one. The API
 * contributions all mount under `/api`, where the upload route is the only one
 * that answers `/projectMaterialFiles/*`.
 */
const routes: readonly AppRouteContribution<Application>[] = [
  materialFileApiRoutes,
  materialFileRootRoutes,
  projectMaterialApiRoutes,
];

export default routes;
