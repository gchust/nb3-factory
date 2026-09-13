import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ExpenseProvider from './expense-provider.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  ExpenseProvider,
];

export default serviceProviders;
