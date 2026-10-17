import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import ServiceDeskProvider from './service-desk.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceDeskProvider,
];

export default serviceProviders;
export { serviceDeskServiceToken } from '../service-desk/service-token.js';
