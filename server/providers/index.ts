import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { VisitorServiceProvider } from './visitor-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  VisitorServiceProvider,
];

export default serviceProviders;
