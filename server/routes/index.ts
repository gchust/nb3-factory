import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import {
  ticketAttachmentApiGuard,
  ticketAttachmentRootGuard,
  ticketAttachmentRoutes,
} from './files.js';
import { ticketApiRoutes } from './tickets.js';

/**
 * Ordered contributions: the ticket API, then the guard that authenticates the
 * file plugin's upload endpoints immediately before the plugin's own API
 * router, then the guard that authenticates the public byte route before it.
 */
const routes: readonly AppRouteContribution<Application>[] = [
  ticketApiRoutes,
  ticketAttachmentApiGuard,
  ticketAttachmentRoutes[0],
  ticketAttachmentRootGuard,
  ticketAttachmentRoutes[1],
];

export default routes;
