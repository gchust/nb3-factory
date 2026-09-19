import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { trainingFileGuards, trainingFileRoutes } from './training-files.js';
import { trainingRoutes } from './training.js';

// Order matters: the file guards authenticate the File Repository paths before
// the generated routes are mounted, so no upload, delete or byte request
// reaches them unauthenticated.
const routes: readonly AppRouteContribution<Application>[] = [
  ...trainingFileGuards,
  ...trainingFileRoutes,
  trainingRoutes,
];

export default routes;
