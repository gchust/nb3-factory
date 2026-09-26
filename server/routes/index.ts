import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { customerMemoRoutes } from './customer-memos.js';

const routes: readonly AppRouteContribution<Application>[] = [
  customerMemoRoutes,
];

export default routes;
