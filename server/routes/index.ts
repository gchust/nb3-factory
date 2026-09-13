import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { createExpenseClaimFileRoutes } from './expense-claim-files.js';
import { expenseClaimRoutes } from './expense-claims.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...createExpenseClaimFileRoutes(),
  expenseClaimRoutes,
];

export default routes;
