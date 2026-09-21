import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { defineApiRoutes, defineRootRoutes } from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { createDashboardRouter } from './dashboard.js';
import {
  createCalibrationRouter,
  createEquipmentRouter,
  createReservationRouter,
} from './equipment.js';
import {
  createLabFileApiRouter,
  registerLabFileContentRoutes,
} from './lab-files.js';
import { createLaboratoryRouter } from './laboratories.js';
import {
  asAppRouter,
  requireAuth,
  withLabErrorHandler,
  type LabHono,
} from './lab-http.js';
import { createSafetyCheckRouter } from './safety-checks.js';
import { createTrainingRouter } from './training-records.js';
import { createWorkOrderRouter } from './work-orders.js';

/**
 * The application's business API.
 *
 * Authentication is installed on `/lab` and `/lab/*` only — the paths this
 * contribution actually owns. A `use('*', ...)` here would also run for every
 * other `/api/...` route the framework and the plugins register, which is why
 * the guard is scoped to an exact prefix instead.
 */
function createLabApiRouter(app: Application): LabHono {
  const router = withLabErrorHandler(new Hono<AuthEnv>());
  const auth = requireAuth(app);

  router.use('/lab', auth);
  router.use('/lab/*', auth);

  router.route('/lab/laboratories', createLaboratoryRouter(app));
  router.route('/lab/equipment', createEquipmentRouter(app));
  router.route('/lab/calibrations', createCalibrationRouter(app));
  router.route('/lab/reservations', createReservationRouter(app));
  router.route('/lab/work-orders', createWorkOrderRouter(app));
  router.route('/lab/safety-checks', createSafetyCheckRouter(app));
  router.route('/lab/training-records', createTrainingRouter(app));
  router.route('/lab/dashboard', createDashboardRouter(app));
  router.route('/lab/files', createLabFileApiRouter(app));

  return router;
}

/**
 * Attachment bytes live in the database and are served here, behind the
 * session and the laboratory rules. The route is deliberately outside `/api`
 * so an `<img src>` in the page can reach it with the session cookie.
 */
function createLabContentRouter(app: Application): LabHono {
  const router = withLabErrorHandler(new Hono<AuthEnv>());
  router.use('/lab-files/*', requireAuth(app));
  registerLabFileContentRoutes(router, app);
  return router;
}

const routes: readonly AppRouteContribution<Application>[] = [
  defineApiRoutes((app) => asAppRouter(createLabApiRouter(app))),
  defineRootRoutes((app) => asAppRouter(createLabContentRouter(app))),
];

export default routes;
