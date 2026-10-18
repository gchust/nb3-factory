import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { todosApiRoutes } from './todos.js';

const routes: readonly AppRouteContribution<Application>[] = [todosApiRoutes];

export default routes;
