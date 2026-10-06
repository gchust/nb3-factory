import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { CrmProvider } from './crm/provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  CrmProvider,
];

export default serviceProviders;
