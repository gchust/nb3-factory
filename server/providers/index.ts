import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import ServiceProviderImpl from './service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceProviderImpl,
];

export default serviceProviders;
