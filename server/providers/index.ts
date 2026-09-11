import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import UserRolesProvider from './user-roles.js';
import EquipmentInspectionProvider from './equipment-inspection.js';

export { equipmentInspectionServiceToken } from './equipment-inspection.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  EquipmentInspectionProvider,
];

export default serviceProviders;
