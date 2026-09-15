import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import InspectionProvider from './inspection.js';
import UserRolesProvider from './user-roles.js';

export { inspectionServiceToken } from './inspection.js';
export {
  ASSIGNABLE_INSPECTION_ROLES,
  INSPECTION_ROLES,
  INSPECTION_ROLE_KEYS,
  ensureInspectionRoles,
  resolveUserRole,
  type InspectionRole,
  type ResolvedRole,
} from './inspection-roles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  InspectionProvider,
];

export default serviceProviders;
