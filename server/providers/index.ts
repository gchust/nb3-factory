import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { DeliveryProvider } from './delivery/provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DeliveryProvider,
];

export default serviceProviders;
