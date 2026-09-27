import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import SalesServiceProvider from './sales-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SalesServiceProvider,
];

export { salesServiceToken } from './sales-service.js';
export { default as SalesServiceProvider } from './sales-service.js';

export default serviceProviders;
