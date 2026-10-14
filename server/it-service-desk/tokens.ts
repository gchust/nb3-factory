import type { LifecycleRuntime } from '@nocobase/lifecycle';
import { createServiceToken } from '@nocobase/service-provider';

import type { ItServiceDeskService } from './service.js';

/** The application's IT service desk domain service. */
export const itServiceDeskToken =
  createServiceToken<ItServiceDeskService>('itServiceDesk');

/** The lifecycle runtime the `tickets` records move through. */
export const itTicketRuntimeToken =
  createServiceToken<LifecycleRuntime>('itTicketRuntime');
