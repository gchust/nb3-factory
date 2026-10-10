import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { libraryApiRoutes } from './library.js';

const routes: readonly AppRouteContribution<Application>[] = [libraryApiRoutes];

export default routes;
