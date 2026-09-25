import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ItTicketServiceProvider } from './it-tickets.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ItTicketServiceProvider,
];

export default serviceProviders;
