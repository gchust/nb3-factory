import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ProductionProvider from './production-provider.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  ProductionProvider,
];

export default serviceProviders;
