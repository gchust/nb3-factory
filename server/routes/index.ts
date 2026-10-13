/**
 * The application's HTTP contributions. Array order is mount order, and an earlier contribution's middleware covers a
 * later route at the same path: the attachment authentication below must stay before the File plugin's routes, which
 * are public by design.
 */
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import tickets from './tickets.js';
import { fileApiAuth, fileRootAuth, fileRoutes } from './files.js';

const routes: readonly AppRouteContribution<Application>[] = [
  tickets,
  fileApiAuth,
  ...fileRoutes.filter((route) => route.scope === 'api'),
  fileRootAuth,
  ...fileRoutes.filter((route) => route.scope === 'root'),
];

export default routes;
