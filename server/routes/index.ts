import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { expenseApiRoutes } from './expenses.js';

const routes: readonly AppRouteContribution<Application>[] = [expenseApiRoutes];

export default routes;
