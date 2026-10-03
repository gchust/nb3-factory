import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';

import type { ServiceConfig } from '../config/service.js';
import { ServiceOrderService } from '../service/order-service.js';
import { ServiceOrderQueryService } from '../service/order-query-service.js';
import { ServiceAttachmentService } from '../service/attachment-service.js';
import { ServiceShareService } from '../service/share-service.js';
import { ServiceDashboardService } from '../service/dashboard-service.js';
import { ServiceInspectionService } from '../service/inspection-service.js';
import { ServiceKnowledgeService } from '../service/knowledge-service.js';
import { ServiceProvisioningService } from '../service/provisioning-service.js';
import { ServiceAssistantService } from '../service/assistant-service.js';
import { createServiceLogger } from '../service/logger.js';
import {
  serviceAttachmentServiceToken,
  serviceDashboardServiceToken,
  serviceInspectionServiceToken,
  serviceKnowledgeServiceToken,
  serviceAssistantServiceToken,
  serviceOrderQueryServiceToken,
  serviceOrderServiceToken,
  serviceProvisioningServiceToken,
  serviceShareServiceToken,
} from '../service/tokens.js';

/**
 * Binds every application-owned service. The providers that follow in the
 * composition root read these bindings; nothing resolves a service by
 * constructing it again.
 */
export class ServiceDomainProvider extends ServiceProvider<Application> {
  name = 'service/domain';

  register(): void {
    const container = this.app.container;
    const serviceConfig =
      this.app.config.get<ServiceConfig>('service') ?? defaultServiceConfig();
    const logger = (name: string) =>
      createServiceLogger(container.resolve(loggingToken), name);

    container.singleton(serviceOrderServiceToken, (resolver) => {
      return new ServiceOrderService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(notificationServiceToken),
        resolver.has(workflowServiceToken)
          ? resolver.resolve(workflowServiceToken)
          : undefined,
        logger('service.order'),
      );
    });

    container.singleton(serviceAttachmentServiceToken, (resolver) => {
      return new ServiceAttachmentService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(driveManagerToken),
        serviceConfig,
        logger('service.attachment'),
      );
    });

    container.singleton(serviceOrderQueryServiceToken, (resolver) => {
      return new ServiceOrderQueryService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(serviceAttachmentServiceToken),
      );
    });

    container.singleton(serviceShareServiceToken, (resolver) => {
      return new ServiceShareService(
        resolver.resolve(databaseManagerToken),
        // The sharing plugin extends `AppAuthorization` with `sharingRules` at
        // runtime; the published type does not carry it, so the service sees
        // the narrow structural view it actually uses.
        resolver.resolve(authorizationToken) as never,
      );
    });

    container.singleton(serviceDashboardServiceToken, (resolver) => {
      return new ServiceDashboardService(
        resolver.resolve(databaseManagerToken),
      );
    });

    container.singleton(serviceKnowledgeServiceToken, (resolver) => {
      return new ServiceKnowledgeService(
        resolver.resolve(databaseManagerToken),
      );
    });

    container.singleton(serviceInspectionServiceToken, (resolver) => {
      return new ServiceInspectionService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(notificationServiceToken),
        logger('service.inspection'),
      );
    });

    container.singleton(serviceAssistantServiceToken, (resolver) => {
      return new ServiceAssistantService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(serviceOrderQueryServiceToken),
        resolver.resolve(serviceKnowledgeServiceToken),
      );
    });

    // Provisioning binds only when the user-management capability is present;
    // an application without it still runs every other service.
    if (container.has(userManagementServiceToken)) {
      container.singleton(serviceProvisioningServiceToken, (resolver) => {
        return new ServiceProvisioningService(
          resolver.resolve(databaseManagerToken),
          resolver.resolve(userManagementServiceToken),
          resolver.has(workflowServiceToken)
            ? resolver.resolve(workflowServiceToken)
            : undefined,
          serviceConfig,
          logger('service.provisioning'),
        );
      });
    }
  }
}

function defaultServiceConfig(): ServiceConfig {
  return {
    demoData: process.env.NODE_ENV !== 'production',
    inspectionSchedule: {
      enabled: true,
      cron: '0 8 * * *',
      timezone: 'Asia/Shanghai',
    },
    overdueSchedule: {
      enabled: true,
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
    },
    attachment: {
      disk: 'local',
      maxBytes: 25 * 1024 * 1024,
      allowedExtensions: ['png', 'docx'],
    },
    demoPassword: 'Service@2026',
  };
}
