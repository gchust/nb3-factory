import { createServiceToken } from '@nocobase/service-provider';

import type { ItTicketService } from './it-ticket-service.js';

export const itTicketServiceToken = createServiceToken<ItTicketService>(
  'app/it-ticket-service',
);
