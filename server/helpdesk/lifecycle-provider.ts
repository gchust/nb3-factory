import type { LifecycleRuntime } from '@nocobase/lifecycle';

import { ticketLifecycle } from './lifecycle.js';
import type { TicketNotifications } from './notifications.js';

/**
 * Registers the ticket state machine on the application's one lifecycle runtime, binding the effects to the
 * notification sender. Called by `server/providers/helpdesk.ts` after the runtime exists and before its jobs start.
 */
export function registerTicketLifecycle(
  runtime: LifecycleRuntime,
  notifications: TicketNotifications,
): void {
  runtime.register(ticketLifecycle, { services: { notifications } });
}
