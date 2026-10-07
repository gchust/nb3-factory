import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { expenseRoutes } from './expense.js';
import { expenseFileRoutes } from './expense-files.js';

/**
 * Every HTTP contribution this application owns.
 *
 * The expense endpoints and the invoice file exposure are both mounted under `/api`; the file exposure additionally
 * contributes the content route at the root, because invoice bytes are served from a path outside `/api`.
 */
export const routes: readonly AppRouteContribution<Application>[] = [
  ...expenseFileRoutes,
  expenseRoutes,
];

export default routes;
