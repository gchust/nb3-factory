import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ServiceProviderClass from './service/provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceProviderClass,
];

export default serviceProviders;
