import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { memoApiRoutes } from './memos.js';

const routes: readonly AppRouteContribution<Application>[] = [memoApiRoutes];

export default routes;
