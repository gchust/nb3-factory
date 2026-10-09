import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { materialsRoutes } from './materials.js';

const routes: readonly AppRouteContribution<Application>[] = [materialsRoutes];

export default routes;
