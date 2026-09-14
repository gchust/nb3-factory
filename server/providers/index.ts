import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AccessCounterProvider from './access-counter.js';
import BuildInfoProvider from './build-info.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  BuildInfoProvider,
  AccessCounterProvider,
];

export default serviceProviders;
