import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import {
  itTicketFileAuthApiRoutes,
  itTicketFileAuthRootRoutes,
} from './it-ticket-file-auth.js';
import { itTicketFileRoutes } from './it-ticket-files.js';
import { itTicketRoutes } from './it-tickets.js';

// The auth contributions come first so they are mounted before the public File
// Repository routes and content paths they guard.
const routes: readonly AppRouteContribution<Application>[] = [
  itTicketFileAuthApiRoutes,
  itTicketFileAuthRootRoutes,
  ...itTicketFileRoutes,
  itTicketRoutes,
];

export default routes;
