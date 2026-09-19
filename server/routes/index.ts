import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { expenseFileRoutes } from './expense-files.js';
import { expenseApiRoutes } from './expenses.js';

const routes: readonly AppRouteContribution<Application>[] = [
  expenseApiRoutes,
  ...expenseFileRoutes,
];

export default routes;
