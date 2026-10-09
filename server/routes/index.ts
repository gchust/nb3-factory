import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { Hono } from 'hono';
import { registerAssistantRoutes } from './service-assistant.js';
import { registerIntegrationKeyRoutes } from './service-api-keys.js';
import { registerContentRoutes } from './service-content.js';
import { registerExternalRoutes } from './service-external.js';
import { attachmentRoutes } from './service-files.js';
import { registerMasterDataRoutes } from './service-master-data.js';
import { registerTicketRoutes } from './service-tickets.js';

/**
 * Everything under `/service` is the after-sales business API. The file plugin
 * contributes its own routes; they are application routes in the sense that the
 * application decides their policy and guards.
 *
 * `auth.required()` here is a session gate only. Each route then checks the
 * collection action or record scope it actually needs, so a signed-in user
 * without the right job permission set gets `403`, not data.
 */
const serviceApiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    router.use('/service/*', auth.required());

    registerTicketRoutes(app, router);
    registerMasterDataRoutes(app, router);
    registerContentRoutes(app, router);
    registerAssistantRoutes(app, router);
    registerExternalRoutes(app, router);
    registerIntegrationKeyRoutes(app, router);

    return router;
  },
);

const routes: readonly AppRouteContribution<Application>[] = [
  serviceApiRoutes,
  ...attachmentRoutes,
];

export default routes;
