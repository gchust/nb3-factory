/**
 * The two services the ticket desk contributes, as tokens other code resolves
 * them by.
 *
 * They live in their own module, free of the implementations, so the lifecycle
 * provider and the desk provider can both import them without importing each
 * other: the desk's service reads the lifecycle runtime, and the runtime's
 * `services` factory reads the desk's service, so a direct import either way
 * would be a cycle — and a cycle at module scope, where a token is created, is
 * a cycle that never finishes.
 */
import type { LifecycleRuntime } from '@nocobase/lifecycle';
import { createServiceToken } from '@nocobase/service-provider';

import type { TicketDeskService } from './ticket-desk/service.js';

/** The desk's domain service: the staff registry, the queries and the writes. */
export const ticketDeskServiceToken =
  createServiceToken<TicketDeskService>('ticketDeskService');

/** The one lifecycle runtime the application registered the ticket lifecycle on. */
export const ticketLifecycleRuntimeToken = createServiceToken<LifecycleRuntime>(
  'ticketLifecycleRuntime',
);
