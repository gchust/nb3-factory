import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import ServiceRequestProvider from './service-request.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceRequestProvider,
];

export default serviceProviders;
