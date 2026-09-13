import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ItAccessProvider from './it-access.js';
import ItServiceProvider from './it-service.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  ItAccessProvider,
  ItServiceProvider,
];

export default serviceProviders;
