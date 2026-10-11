import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import todosRoutes from './todos.js';

const routes: readonly AppRouteContribution<Application>[] = [todosRoutes];

export default routes;
