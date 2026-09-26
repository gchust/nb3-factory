import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { todoRoutes } from './todos.js';

const routes: readonly AppRouteContribution<Application>[] = [todoRoutes];

export default routes;
