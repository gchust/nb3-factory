import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { createLedgerRouter } from './ledger.js';
import { createTicketRouter } from './tickets.js';
import { createKnowledgeRouter } from './knowledge.js';
import { createInspectionRouter } from './inspections.js';
import { createInsightRouter } from './insight.js';
import { createExternalRouter } from './external.js';
import { createIntegrationKeyRouter } from './integration.js';

/**
 * The service desk's HTTP surface, all under `/api/service`.
 *
 * This is one isolated sub-router, so the session middleware it installs
 * cannot reach a route another contribution owns. Every path below is the
 * application's own; the services behind them enforce the business rules.
 */
const routes: readonly AppRouteContribution<Application>[] = [
  defineApiRoutes((app: Application) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    // Cookie session or `x-api-key`, resolved by Authentication either way.
    router.use('/service/*', auth.required());

    router.route('/service', createLedgerRouter(app));
    router.route('/service', createTicketRouter(app));
    router.route('/service', createKnowledgeRouter(app));
    router.route('/service', createInspectionRouter(app));
    router.route('/service', createInsightRouter(app));
    router.route('/service', createExternalRouter(app));
    router.route('/service', createIntegrationKeyRouter(app));

    return router;
  }),
];

export default routes;
