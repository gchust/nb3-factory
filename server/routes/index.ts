import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import attachmentsApiRoutes from './attachments.js';
import materialContentRoutes from './material-content.js';
import materialsApiRoutes from './materials.js';

const routes: readonly AppRouteContribution<Application>[] = [
  materialsApiRoutes,
  attachmentsApiRoutes,
  materialContentRoutes,
];

export default routes;
