import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import CustomerMemoProvider from './customer-memo-service.js';

export {
  customerMemoServiceToken,
  createCustomerMemoService,
} from './customer-memo-service.js';
export type {
  CreateCustomerMemoInput,
  CustomerMemo,
  CustomerMemoService,
  ListCustomerMemosOptions,
  UpdateCustomerMemoInput,
} from './customer-memo-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  CustomerMemoProvider,
];

export default serviceProviders;
