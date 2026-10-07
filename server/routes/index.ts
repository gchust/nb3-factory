import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { createAdminRouter } from './admin.js';
import { createDocumentsRouter } from './documents.js';

/**
 * The application's `/api` routes. `defineApiRoutes` mounts this under `/api`,
 * so the paths below do not repeat it.
 *
 * Each prefix is a sub-router with its own middleware, so no wildcard on a
 * router mounted at `/api` can leak into a contribution mounted after it.
 */
export const apiRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  router.route('/documents', createDocumentsRouter(app.container));
  router.route('/', createAdminRouter(app.container));
  return router;
});

export default [apiRoutes];
