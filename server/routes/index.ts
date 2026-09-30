import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { createAssistantRoutes } from './assistant.js';
import { createAttachmentRoutes } from './attachments.js';
import { createDashboardRoutes } from './dashboard.js';
import { createCustomerRoutes, createDeviceRoutes } from './directory.js';
import { createExternalRoutes } from './external.js';
import {
  createDirectoryRoutes,
  createInspectionRoutes,
} from './inspections.js';
import { createKnowledgeRoutes } from './knowledge.js';
import { createScheduleRoutes } from './schedules.js';
import { createTicketRoutes } from './tickets.js';

/**
 * The after-sales service API, mounted under `/api/service`. Each sub-router
 * owns its own authentication and authorization middleware; this factory only
 * mounts them at their prefixes.
 */
export const serviceApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const root = new Hono();
    root.route('/service/external', createExternalRoutes(app));
    root.route('/service/dashboard', createDashboardRoutes(app));
    root.route('/service/customers', createCustomerRoutes(app));
    root.route('/service/devices', createDeviceRoutes(app));
    root.route('/service/tickets', createTicketRoutes(app));
    root.route('/service/knowledge', createKnowledgeRoutes(app));
    root.route('/service/inspections', createInspectionRoutes(app));
    root.route('/service/attachments', createAttachmentRoutes(app));
    root.route('/service/assistant', createAssistantRoutes(app));
    root.route('/service/schedules', createScheduleRoutes(app));
    root.route('/service/directory', createDirectoryRoutes(app));
    return root;
  });

const routes: readonly AppRouteContribution<Application>[] = [serviceApiRoutes];

export default routes;
