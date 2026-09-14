import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { previewSmokeRoutes } from './preview-smoke.js';

const routes: readonly AppRouteContribution<Application>[] = [
  previewSmokeRoutes,
];

export default routes;
