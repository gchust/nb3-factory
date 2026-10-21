import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { TicketService } from './service.js';

export const ticketServiceToken: ServiceToken<TicketService> =
  createServiceToken<TicketService>('app/ticket-service');
