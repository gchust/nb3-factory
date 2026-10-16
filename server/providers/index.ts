import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { TicketLifecycleProvider } from './lifecycles.js';
import { TicketDeskProvider } from './ticket-desk/index.js';
import {
  ticketDeskServiceToken,
  ticketLifecycleRuntimeToken,
} from './tokens.js';

/**
 * The application's own services, in registration order: the lifecycle runtime
 * first, because the desk resolves it, and the desk second, because the
 * runtime's `services` factory resolves the desk.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TicketLifecycleProvider,
  TicketDeskProvider,
];

export { ticketDeskServiceToken, ticketLifecycleRuntimeToken };
export { TicketDeskProvider, TicketLifecycleProvider };
export default serviceProviders;
