import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import LeaveRequestServiceProvider from './leave-requests.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  LeaveRequestServiceProvider,
  UserRolesProvider,
];

export default serviceProviders;
