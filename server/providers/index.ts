import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import HrProvider from './hr.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  HrProvider,
];

export default serviceProviders;
