import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { TicketsProvider } from './tickets.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TicketsProvider,
];

export default serviceProviders;
