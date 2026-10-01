import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { CrmServiceProvider } from './crm/index.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  CrmServiceProvider,
];

export default serviceProviders;
