import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import CustomerMemoProvider from './memos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  CustomerMemoProvider,
];

export {
  customerMemoServiceToken,
  MemoValidationError,
  type CustomerMemo,
  type CustomerMemoInput,
  type CustomerMemoService,
} from './memos.js';

export default serviceProviders;
