import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import CustomerMemoProvider from './customer-memos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  CustomerMemoProvider,
];

export default serviceProviders;
