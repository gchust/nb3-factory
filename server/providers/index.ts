import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import CrmProvider from './crm/index.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  CrmProvider,
];

export default serviceProviders;
