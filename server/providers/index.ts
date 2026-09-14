import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import RecruitingProvider from './recruiting.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  RecruitingProvider,
];

export default serviceProviders;
