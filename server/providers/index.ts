import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import CrmServiceProvider from './crm.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  CrmServiceProvider,
];

export default serviceProviders;
