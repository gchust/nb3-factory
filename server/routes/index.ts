import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { qualityApiRoutes } from './quality.js';

const routes: readonly AppRouteContribution<Application>[] = [qualityApiRoutes];

export default routes;
