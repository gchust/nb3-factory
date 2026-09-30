import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { ServiceDomainProvider } from './service-domain-provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceDomainProvider,
];

export default serviceProviders;
