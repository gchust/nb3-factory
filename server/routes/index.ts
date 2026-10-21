import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import documentSharingRoutes from './document-sharing.js';
import documentRoutes from './documents.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...documentRoutes,
  ...documentSharingRoutes,
];

export default routes;
