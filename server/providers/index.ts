import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import SupportTicketsProvider from './support/index.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  SupportTicketsProvider,
];

export default serviceProviders;
