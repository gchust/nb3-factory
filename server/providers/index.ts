import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { TicketServiceProvider } from './tickets.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TicketServiceProvider,
];

export default serviceProviders;
