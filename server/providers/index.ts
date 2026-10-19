import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ItTicketServiceProvider from './it-ticket-service-provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ItTicketServiceProvider,
];

export default serviceProviders;
