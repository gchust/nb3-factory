import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import todos from './todos.js';

const routes: readonly AppRouteContribution<Application>[] = [todos];

export default routes;
