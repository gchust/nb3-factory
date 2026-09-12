import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import {
  leaveEvidenceContentRoutes,
  leaveRequestApiRoutes,
} from './leave-requests.js';

const routes: readonly AppRouteContribution<Application>[] = [
  leaveRequestApiRoutes,
  leaveEvidenceContentRoutes,
];

export default routes;
