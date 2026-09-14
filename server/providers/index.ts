import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import RetailProvider from './retail/provider.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  RetailProvider,
];

export default serviceProviders;
