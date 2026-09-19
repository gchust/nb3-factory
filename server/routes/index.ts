import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { trainingRoutes } from './training.js';

const routes: readonly AppRouteContribution<Application>[] = [trainingRoutes];

export default routes;
