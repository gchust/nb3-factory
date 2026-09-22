import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { fieldVisitApiRoutes } from './field-visits.js';

const routes: readonly AppRouteContribution<Application>[] = [
  fieldVisitApiRoutes,
];

export default routes;
