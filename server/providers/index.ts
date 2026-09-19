import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import DeliveryProvider from './delivery-service.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  DeliveryProvider,
];

export default serviceProviders;
