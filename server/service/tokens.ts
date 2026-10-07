import { createServiceToken } from '@nocobase/service-provider';

import type { Service } from './service.js';

/** The single service instance every route, task and provider reads. */
export const serviceToken = createServiceToken<Service>('app/service');
