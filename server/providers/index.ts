import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { SalesServiceProvider } from './sales-provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SalesServiceProvider,
];

export default serviceProviders;
