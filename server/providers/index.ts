import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import QualityProvider from './quality.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  QualityProvider,
];

export default serviceProviders;
