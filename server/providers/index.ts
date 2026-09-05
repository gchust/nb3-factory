import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AppExampleProvider from './app-example.js';
import EquipmentProvider from './equipment.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';

export { equipmentServiceToken, type EquipmentService } from './equipment.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
  EquipmentProvider,
];

export default serviceProviders;
