import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ExpenseAuthorizationProvider from './expense-authorization.js';
import ExpenseServiceProvider from './expense-service.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  ExpenseServiceProvider,
  ExpenseAuthorizationProvider,
];

export default serviceProviders;
