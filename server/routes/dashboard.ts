import { Hono } from 'hono';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serviceDashboardServiceToken } from '../providers/tokens.js';
import type { ServiceDashboardService } from '../providers/dashboard-service.js';
import {
  authorizeAction,
  requirePolicy,
  type ServiceEnv,
} from './service-shared.js';

/**
 * Dashboard totals. Every count runs through the policies the caller's
 * `service.dashboard` view action returned, so an observer totals only the
 * non-confidential tickets and an engineer only their own work.
 */
export function createDashboardRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const dashboard: ServiceDashboardService = app.container.resolve(
    serviceDashboardServiceToken,
  );
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  routes.get('/', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.dashboard',
      'view',
    );
    const summary = await dashboard.summary({
      tickets: requirePolicy(policies, 'serviceTickets'),
      inspections: requirePolicy(policies, 'serviceInspections'),
      customers: requirePolicy(policies, 'serviceCustomers'),
      devices: requirePolicy(policies, 'serviceDevices'),
    });
    return context.json({ data: summary });
  });

  return routes;
}
