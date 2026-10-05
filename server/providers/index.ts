import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { ItTicketsProvider } from './it-tickets.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ItTicketsProvider,
];

export default serviceProviders;
