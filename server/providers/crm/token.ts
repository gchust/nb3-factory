import { createServiceToken } from '@nocobase/service-provider';

import type { CrmService } from './service.js';

/** Resolves the CRM domain service from the application container. */
export const crmServiceToken = createServiceToken<CrmService>('crm.service');
