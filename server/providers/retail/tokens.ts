import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { RetailService } from './service.js';

export const retailServiceToken: ServiceToken<RetailService> =
  createServiceToken<RetailService>('app/retail-service');
