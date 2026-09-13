import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ProcurementProvider from './procurement.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  ProcurementProvider,
];

export default serviceProviders;
