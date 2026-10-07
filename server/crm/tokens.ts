import { createServiceToken } from '@nocobase/service-provider';

import type { CrmService } from './service.js';

/** The CRM domain service, registered by the CRM provider and read by its routes. */
export const crmServiceToken =
  createServiceToken<CrmService>('@nocobase/app/crm');
