import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import employeeAttachmentRoutes from './employee-attachments.js';
import { employeeRoutes } from './employees.js';

const routes: readonly AppRouteContribution<Application>[] = [
  employeeRoutes,
  ...employeeAttachmentRoutes,
];

export default routes;
