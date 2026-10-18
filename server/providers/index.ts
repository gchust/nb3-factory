import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ItServiceDeskProvider } from './it-service-desk.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ItServiceDeskProvider,
];

export default serviceProviders;
