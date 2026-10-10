import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Hono } from 'hono';

import { registerAssistantRoutes } from './assistant.js';
import { registerCatalogRoutes } from './catalog.js';
import { registerInspectionRoutes } from './inspections.js';
import { registerIntegrationKeyRoutes } from './integration-keys.js';
import { registerIntegrationRoutes } from './integration.js';
import { registerKnowledgeRoutes } from './knowledge.js';
import { registerOrderRoutes } from './orders.js';
import { createServiceRouter, resolveServices } from './support.js';

/**
 * The after-sales service API.
 *
 * Every business prefix is authenticated and authorized once, at the prefix, so
 * a newly added route inside it cannot accidentally be reachable without a
 * session or without a permission check. Each handler then performs the
 * composite check its own operation needs; mounting under `/api` authenticates
 * nothing by itself.
 */
const BUSINESS_PREFIXES = [
  '/serviceOrders',
  '/customers',
  '/devices',
  '/serviceGroups',
  '/repairKnowledge',
  '/deviceManuals',
  '/serviceInspections',
  '/serviceDashboard',
  '/serviceAssistant',
  '/integration',
] as const;

const supportApiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const services = resolveServices(app);
    const router = createServiceRouter();

    for (const prefix of BUSINESS_PREFIXES) {
      // Both forms are registered because Hono matches `/orders` and
      // `/orders/1` as separate patterns; without the wildcard the collection
      // route itself would be the only unprotected one.
      router.use(prefix, services.auth.required());
      router.use(`${prefix}/*`, services.auth.required());
      router.use(prefix, services.authorization.middleware());
      router.use(`${prefix}/*`, services.authorization.middleware());
    }

    registerOrderRoutes(router, services);
    registerCatalogRoutes(router, services);
    registerKnowledgeRoutes(router, services);
    registerInspectionRoutes(router, services);
    registerIntegrationRoutes(router, services);
    registerIntegrationKeyRoutes(router, services);
    registerAssistantRoutes(router, services);

    // The router carries the request's auth and authorization variables, which
    // the contribution type does not parameterize. The cast narrows the Hono
    // environment back to the default one at the composition boundary; every
    // handler still reads its variables through the typed `ServiceRouter`.
    return router as unknown as Hono;
  },
);

const routes: readonly AppApiRouteContribution<Application>[] = [
  supportApiRoutes,
];

export default routes;
