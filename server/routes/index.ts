import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { serviceAttachmentRoutes } from './service-attachments.js';
import { serviceRoutes } from './service.js';

const routes: readonly AppRouteContribution<Application>[] = [
  serviceRoutes,
  ...serviceAttachmentRoutes,
];

export default routes;
