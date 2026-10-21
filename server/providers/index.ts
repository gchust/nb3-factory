import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { TicketProvider } from '../tickets/provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TicketProvider,
];

export default serviceProviders;
