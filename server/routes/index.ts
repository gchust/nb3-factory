import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { defineItTicketFileRoutes } from './it-ticket-files.js';
import { itTicketApiRoutes } from './it-tickets.js';

// The application's own HTTP surface. `itTicketApiRoutes` is the business API; `defineItTicketFileRoutes` adds the
// file exposure's upload endpoint and its public byte route for ticket attachments.
const routes: readonly AppRouteContribution<Application>[] = [
  itTicketApiRoutes,
  ...defineItTicketFileRoutes(),
];

export default routes;
