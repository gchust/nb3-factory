import type { ServiceAttachmentService } from './attachment-service.js';
import type { ServiceAssistantService } from './assistant-service.js';
import type { ServiceDashboardService } from './dashboard-service.js';
import type { ServiceDirectoryService } from './directory-service.js';
import type { ServiceInspectionService } from './inspection-service.js';
import type { ServiceKnowledgeService } from './knowledge-service.js';
import type { ServiceTicketService } from './ticket-service.js';
import type { ServiceAcceptanceService } from './acceptance-service.js';
import type { ServiceScheduleService } from './service-schedules.js';
import { sharedServiceToken } from './service-tokens.js';

/**
 * Application-owned service tokens. Tokens are plain identity objects, so
 * declaring them at module scope registers nothing; the domain provider binds
 * an implementation to each one in its `register()`.
 *
 * `sharedServiceToken` keeps one token object per name on `globalThis` so a
 * materialized workflow run module resolves the same service. That helper
 * cannot live under `server/workflows`, which `nocobase workflow build` clears
 * after compiling it, so the application side is `./service-tokens.ts` and the
 * Artifact carries its own copy. See that module for the full reasoning.
 */
export const serviceTicketServiceToken =
  sharedServiceToken<ServiceTicketService>('service.ticket');
export const serviceAcceptanceServiceToken =
  sharedServiceToken<ServiceAcceptanceService>('service.acceptance');
export const serviceDirectoryServiceToken =
  sharedServiceToken<ServiceDirectoryService>('service.directory');
export const serviceKnowledgeServiceToken =
  sharedServiceToken<ServiceKnowledgeService>('service.knowledge');
export const serviceInspectionServiceToken =
  sharedServiceToken<ServiceInspectionService>('service.inspection');
export const serviceDashboardServiceToken =
  sharedServiceToken<ServiceDashboardService>('service.dashboard');
export const serviceAttachmentServiceToken =
  sharedServiceToken<ServiceAttachmentService>('service.attachment');
export const serviceAssistantServiceToken =
  sharedServiceToken<ServiceAssistantService>('service.assistant');
export const serviceScheduleServiceToken =
  sharedServiceToken<ServiceScheduleService>('service.schedule');
