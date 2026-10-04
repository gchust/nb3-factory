import { createServiceToken } from '@nocobase/service-provider';

import type { ServiceAccess } from './access.js';
import type { AssistantService } from './assistant-service.js';
import type { CatalogService } from './catalog-service.js';
import type { DashboardService } from './dashboard-service.js';
import type { ExternalTicketService } from './external-ticket-service.js';
import type { InspectionService } from './inspection-service.js';
import type { ServiceInstall } from './install-service.js';
import type { ServiceNotifier } from './notification-service.js';
import type { ServiceRepositories } from './repositories.js';
import type { ServiceRouting } from './routing-service.js';
import type { TicketService } from './ticket-service.js';

/** Repositories bound to the business authorization model. */
export const serviceRepositoriesToken = createServiceToken<ServiceRepositories>(
  '@app/service/repositories',
);
/**
 * Resolves an authenticated user into the business role the module routes and
 * AI tools both act on. Shared as a token so an AI tool reaches the same
 * visibility boundary the HTTP routes use instead of rebuilding it.
 */
export const serviceAccessToken = createServiceToken<ServiceAccess>(
  '@app/service/access',
);
/** Customers, devices and knowledge articles. */
export const catalogServiceToken = createServiceToken<CatalogService>(
  '@app/service/catalog',
);
/** Durable in-app messages sent on ticket and inspection changes. */
export const serviceNotifierToken = createServiceToken<ServiceNotifier>(
  '@app/service/notifier',
);
/** Ticket lifecycle: create, accept, start, submit, close, return and shares. */
export const ticketServiceToken = createServiceToken<TicketService>(
  '@app/service/tickets',
);
/** Inspection planning and completion. */
export const inspectionServiceToken = createServiceToken<InspectionService>(
  '@app/service/inspections',
);
/** Role-scoped service dashboard. */
export const dashboardServiceToken = createServiceToken<DashboardService>(
  '@app/service/dashboard',
);
/** Device-platform intake with business de-duplication. */
export const externalTicketServiceToken =
  createServiceToken<ExternalTicketService>('@app/service/external-tickets');
/** Engineer roster and least-loaded routing shared by routes and workflows. */
export const serviceRoutingToken = createServiceToken<ServiceRouting>(
  '@app/service/routing',
);
/** Idempotent installation of demonstration accounts and their role assignments. */
export const serviceInstallToken = createServiceToken<ServiceInstall>(
  '@app/service/install',
);
/** Knowledge lookup behind the ticket assistant panel. */
export const serviceAssistantToken = createServiceToken<AssistantService>(
  '@app/service/assistant',
);
