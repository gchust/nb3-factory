import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { todoApiRoutes } from './todos.js';

const routes: readonly AppRouteContribution<Application>[] = [todoApiRoutes];

export default routes;
