import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ProductsProvider from './products-provider.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  ProductsProvider,
];

export default serviceProviders;
