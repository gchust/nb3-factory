import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ContractsProvider from './contracts.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  ContractsProvider,
];

export default serviceProviders;
