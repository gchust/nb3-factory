import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { ticketFileAuthRoutes, ticketFileRoutes } from './files.js';
import { ticketApiRoutes } from './tickets.js';

/**
 * Application-owned HTTP endpoints, mounted under `/api`.
 *
 * Order matters: `ticketFileAuthRoutes` installs the authentication and authorization middleware for the file
 * exposure, so it must come before the generated `ticketFileRoutes` it protects. The content byte route the file
 * plugin adds is a root route and stays public by design.
 */
const routes: AppRouteContribution<Application>[] = [
  ticketApiRoutes,
  ticketFileAuthRoutes,
  ...ticketFileRoutes,
];

export default routes;
