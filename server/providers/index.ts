import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ExpenseClaimsProvider from './expense-claims.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  ExpenseClaimsProvider,
];

export default serviceProviders;
