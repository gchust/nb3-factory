import { createServiceToken } from '@nocobase/service-provider';

import type { HelpdeskService } from './service.js';

/** The application's IT service desk domain service, bound during the helpdesk provider's register(). */
export const helpdeskServiceToken = createServiceToken<HelpdeskService>(
  'nb3-factory/helpdesk-service',
);
