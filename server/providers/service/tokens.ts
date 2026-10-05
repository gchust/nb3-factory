import { createServiceToken } from '@nocobase/service-provider';

import type { ServiceOperations } from './operations.js';

/** The application's after-sales service domain operations. */
export const serviceOperationsToken = createServiceToken<ServiceOperations>(
  'nb3-factory/service-operations',
);

/** The permission-set keys this application assigns directly to its users. */
export const SERVICE_PERMISSION_SETS = {
  manager: 'service-manager',
  engineer: 'service-engineer',
  observer: 'service-observer',
  integrator: 'service-integrator',
} as const;

/** The page ids whose `access` grant additionally gates a server capability. */
export const SERVICE_PAGE_IDS = {
  dashboard: 'service-dashboard',
  workOrders: 'service-work-orders',
  equipment: 'service-equipment',
  customers: 'service-customers',
  inspections: 'service-inspections',
  knowledge: 'service-knowledge',
  manuals: 'service-manuals',
  assistant: 'service-assistant',
  integration: 'service-integration',
  messages: 'service-messages',
} as const;
