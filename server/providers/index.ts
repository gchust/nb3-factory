import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ServiceLedgerProvider from './service.js';
import AIResourcesProvider from './ai-resources.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceLedgerProvider,
  AIResourcesProvider,
];

export default serviceProviders;
