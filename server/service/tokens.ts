import { createServiceToken } from '@nocobase/service-provider';

import type { DashboardService } from './dashboard.js';
import type { InspectionService } from './inspections.js';
import type { IntegrationService } from './integration.js';
import type { ServiceAttachmentService } from './attachments.js';
import type { WorkOrderService } from './work-orders.js';

/**
 * Every service token the application owns lives here.
 *
 * A service token's identity is the object `createServiceToken` returns, and the container keys bindings by that
 * identity, so a second call with the same name would create a different key that resolves nothing. One module
 * owning every call keeps that from happening.
 */
export const workOrderServiceToken = createServiceToken<WorkOrderService>(
  'nb3-factory/work-orders',
);

export const inspectionServiceToken = createServiceToken<InspectionService>(
  'nb3-factory/inspections',
);

export const integrationServiceToken = createServiceToken<IntegrationService>(
  'nb3-factory/integration',
);

export const dashboardServiceToken = createServiceToken<DashboardService>(
  'nb3-factory/dashboard',
);

export const serviceAttachmentServiceToken =
  createServiceToken<ServiceAttachmentService>('nb3-factory/attachments');
