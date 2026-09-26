import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { EquipmentProvider } from './equipment-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  EquipmentProvider,
];

export default serviceProviders;

export { equipmentServiceToken } from './equipment-service.js';
export type {
  EquipmentService,
  EquipmentStats,
  EquipmentView,
  LoanView,
} from './equipment-service.js';
