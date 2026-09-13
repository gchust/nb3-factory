import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import DeliveryProvider from './delivery-provider.js';
import DeliveryRolesProvider from './delivery-roles.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  DeliveryProvider,
  DeliveryRolesProvider,
];

export default serviceProviders;
