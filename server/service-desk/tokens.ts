import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { TicketWorkflow } from './service.js';

/**
 * The ticket workflow, bound by `ServiceDeskProvider` so the routes resolve the
 * domain logic without importing the implementation. Two `createServiceToken`
 * calls with the same name are different keys, so always import this one.
 */
export const serviceDeskServiceToken: ServiceToken<TicketWorkflow> =
  createServiceToken<TicketWorkflow>('app/service-desk');
