import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as todoRoutes } from './todos.js';

const routes: readonly AppRouteContribution<Application>[] = [
  // The todo list the scheduling task keeps up to date. Its page is client/pages/todos.
  todoRoutes,
];

export default routes;
