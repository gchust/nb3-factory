import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import OfficeSuppliesProvider from './office-supplies.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  OfficeSuppliesProvider,
];

export default serviceProviders;
