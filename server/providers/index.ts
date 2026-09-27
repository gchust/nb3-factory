import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import ServiceModuleProvider from './service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceModuleProvider,
];

export default serviceProviders;
