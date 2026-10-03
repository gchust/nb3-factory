import { createServiceToken } from '@nocobase/service-provider';

import type { ServiceOrderService } from './order-service.js';
import type { ServiceOrderQueryService } from './order-query-service.js';
import type { ServiceAttachmentService } from './attachment-service.js';
import type { ServiceShareService } from './share-service.js';
import type { ServiceDashboardService } from './dashboard-service.js';
import type { ServiceProvisioningService } from './provisioning-service.js';
import type { ServiceInspectionService } from './inspection-service.js';
import type { ServiceKnowledgeService } from './knowledge-service.js';
import type { ServiceAssistantService } from './assistant-service.js';

/**
 * Domain tokens owned by this application. Each is a distinct object identity,
 * so a token is created exactly once here and bound in
 * `ServiceDomainProvider.register()`.
 */
export const serviceOrderServiceToken =
  createServiceToken<ServiceOrderService>('service.order');
export const serviceOrderQueryServiceToken =
  createServiceToken<ServiceOrderQueryService>('service.order-query');
export const serviceAttachmentServiceToken =
  createServiceToken<ServiceAttachmentService>('service.attachment');
export const serviceShareServiceToken =
  createServiceToken<ServiceShareService>('service.share');
export const serviceDashboardServiceToken =
  createServiceToken<ServiceDashboardService>('service.dashboard');
export const serviceProvisioningServiceToken =
  createServiceToken<ServiceProvisioningService>('service.provisioning');
export const serviceInspectionServiceToken =
  createServiceToken<ServiceInspectionService>('service.inspection');
export const serviceKnowledgeServiceToken =
  createServiceToken<ServiceKnowledgeService>('service.knowledge');
export const serviceAssistantServiceToken =
  createServiceToken<ServiceAssistantService>('service.assistant');
