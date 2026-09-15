import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { MediaServiceProvider } from '../media/service.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  MediaServiceProvider,
];

export default serviceProviders;
