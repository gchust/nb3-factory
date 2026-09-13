import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AnnouncementProvider from './announcements.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  AnnouncementProvider,
];

export default serviceProviders;
