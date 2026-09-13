import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import attachmentRoutes from './attachments.js';
import { expenseApiRoutes } from './expense.js';
import { registrationApiRoutes } from './registration.js';

const routes: readonly AppRouteContribution<Application>[] = [
  expenseApiRoutes,
  registrationApiRoutes,
  ...attachmentRoutes,
];

export default routes;
