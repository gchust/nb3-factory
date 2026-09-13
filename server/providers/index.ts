import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ResourceCenterProvider from './resource-center.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  ResourceCenterProvider,
];

export default serviceProviders;
