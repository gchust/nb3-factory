import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ServiceDeskProvider from '../service-desk/provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceDeskProvider,
];

export default serviceProviders;
