import { createServiceToken } from '@nocobase/service-provider';
import type { ServiceDeskService } from './service.js';

export const serviceDeskServiceToken =
  createServiceToken<ServiceDeskService>('service-desk');
