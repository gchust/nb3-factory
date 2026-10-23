import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { TicketServiceProvider } from './ticket-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  // Owns the ticket lifecycle runtime, the ticket domain service and the feature's permission model.
  TicketServiceProvider,
];

export default serviceProviders;
