import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import CustomerMemoServiceProvider from './customer-memos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  CustomerMemoServiceProvider,
];

export default serviceProviders;
