import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import customerMemos from './customer-memos.js';

const routes: readonly AppRouteContribution<Application>[] = [customerMemos];

export default routes;
