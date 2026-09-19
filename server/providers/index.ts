import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import RentalProvider from './rental-provider.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  RentalProvider,
];

export default serviceProviders;
