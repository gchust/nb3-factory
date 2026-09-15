import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { expenseApiRoutes } from './expense.js';
import {
  expenseFileContentRoutes,
  expenseFileUploadRoutes,
} from './expense-files.js';

const routes: readonly AppRouteContribution<Application>[] = [
  expenseApiRoutes,
  expenseFileUploadRoutes,
  expenseFileContentRoutes,
];

export default routes;
