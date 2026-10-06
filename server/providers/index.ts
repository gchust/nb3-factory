import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { RepairTicketsProvider } from './tickets.js';

// Application-owned providers. Order is boot order, after every plugin provider.
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  RepairTicketsProvider,
];

export default serviceProviders;
