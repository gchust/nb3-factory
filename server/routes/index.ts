import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as documentsRoutes } from './documents.js';

const routes: readonly AppRouteContribution<Application>[] = [documentsRoutes];

export default routes;
