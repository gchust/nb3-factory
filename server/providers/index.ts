import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import CustomerMemosProvider from './customer-memos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  CustomerMemosProvider,
];

export default serviceProviders;
