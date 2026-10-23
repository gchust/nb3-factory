import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import ticketFileRoutes from './file-routes.js';
import ticketApiRoutes from './tickets.js';

/**
 * Every route this application answers.
 *
 * `ticketApiRoutes` serves the IT service desk under `/api/tickets`; `ticketFileRoutes` is the file plugin's upload,
 * metadata and content contributions for issue screenshots, each already wrapped in this application's authentication
 * and ticket-ownership check.
 */
const routes: readonly AppRouteContribution<Application>[] = [
  ticketApiRoutes,
  ...ticketFileRoutes,
];

export default routes;
