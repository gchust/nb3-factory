import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { customerMemoApiRoutes } from './customer-memos.js';

const routes: readonly AppRouteContribution<Application>[] = [
  customerMemoApiRoutes,
];

export default routes;
