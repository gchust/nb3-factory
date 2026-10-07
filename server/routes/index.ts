import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import documents from './documents.js';

const routes: readonly AppRouteContribution<Application>[] = [documents];

export default routes;
