import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { rentalsRoutes } from './rentals.js';

const routes: readonly AppRouteContribution<Application>[] = [rentalsRoutes];

export default routes;
