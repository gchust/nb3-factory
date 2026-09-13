import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import EmployeeRecordsProvider from './employee-records.js';
import UserRolesProvider from './user-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  EmployeeRecordsProvider,
];

export default serviceProviders;
