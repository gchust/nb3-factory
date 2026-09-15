import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import DocumentAuthorizationProvider from './document-authorization.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  DocumentAuthorizationProvider,
];

export default serviceProviders;
