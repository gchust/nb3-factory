import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';

import type { ServiceConfig } from '../config/service.js';
import {
  serviceAttachmentServiceToken,
  serviceDashboardServiceToken,
  serviceInspectionServiceToken,
  serviceKnowledgeServiceToken,
  serviceAssistantServiceToken,
  serviceOrderQueryServiceToken,
  serviceOrderServiceToken,
  serviceShareServiceToken,
} from '../service/tokens.js';
import { createServiceRouter } from './service.routes.js';
import { createAttachmentRouter } from './attachments.routes.js';
import { createAssistantRouter } from './assistant.routes.js';
import { createDeviceReportRouter } from './device-reports.routes.js';
import type { ServiceRouteDeps } from './support.js';

const serviceApiRoutes = defineApiRoutes<Application>((app) => {
  const container = app.container;
  const deps: ServiceRouteDeps = {
    container,
    database: container.resolve(databaseManagerToken),
    orders: container.resolve(serviceOrderServiceToken),
    queries: container.resolve(serviceOrderQueryServiceToken),
    attachments: container.resolve(serviceAttachmentServiceToken),
    shares: container.resolve(serviceShareServiceToken),
    dashboard: container.resolve(serviceDashboardServiceToken),
    inspections: container.resolve(serviceInspectionServiceToken),
    knowledge: container.resolve(serviceKnowledgeServiceToken),
    assistant: container.resolve(serviceAssistantServiceToken),
    notifications: container.resolve(notificationServiceToken),
    config: app.config.get<ServiceConfig>('service') as ServiceConfig,
  };

  const root = new Hono();

  // The whole `/service` namespace is this application's: mounting the session
  // and authorization middleware on it authenticates every route below and
  // cannot reach another contribution's paths.
  const auth = container.resolve(authenticationToken);
  const authz = container.resolve(authorizationToken);
  root.use('/service/*', auth.required(), authz.middleware() as never);

  root.route('/service', createServiceRouter(deps));
  root.route('/service', createAttachmentRouter(deps));
  root.route('/service', createAssistantRouter(deps));
  root.route('/service', createDeviceReportRouter(deps));

  const logger = container.resolve(loggingToken).getLogger('service.routes');
  root.onError((error, context) => {
    logger.error({ err: error }, 'Service route failed');
    const message =
      error instanceof Error ? error.message : '服务请求处理失败。';
    return context.json({ error: { code: 'INTERNAL_ERROR', message } }, 500);
  });

  return root;
});

const routes: readonly AppRouteContribution<Application>[] = [serviceApiRoutes];

export default routes;
