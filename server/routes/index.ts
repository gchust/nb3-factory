import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import documentsApiRoutes from './documents.js';

const routes: readonly AppRouteContribution<Application>[] = [
  documentsApiRoutes,
];

export default routes;
